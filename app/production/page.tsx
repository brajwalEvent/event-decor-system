"use client";
import React, { useState, useEffect, useMemo } from "react";
import { db } from "../../lib/firebase";
import { collection, getDocs, doc, getDoc, updateDoc, query, orderBy } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

type TabCategory = "all" | "flowers" | "consumables" | "rentals" | "labor" | "purchases";

interface AggregatedItem {
  id: string; // Unique composite key: type_weddingId_originalId
  originalId: string;
  sourceType: "flower" | "consumable" | "rental" | "labor" | "purchase";
  weddingId: string;
  weddingTitle: string;
  weddingDate: string;
  itemName: string;
  specOrCategory: string;
  vendorOrVariety?: string;
  unit: string;
  quantity: number;
  duration?: string;
  unitCost: number;
  totalCost: number;
  notes?: string;
  customGroup?: string;
}

export default function MasterProcurementHubPage() {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  const [loadingData, setLoadingData] = useState(true);
  const [allItems, setAllItems] = useState<AggregatedItem[]>([]);
  const [allWeddings, setAllWeddings] = useState<{ id: string; title: string; date: string }[]>([]);

  // Filter & View States
  const [activeTab, setActiveTab] = useState<TabCategory>("all");
  const [selectedWeddingId, setSelectedWeddingId] = useState<string>("all");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("" );
  const [viewMode, setViewMode] = useState<"table" | "grouped">("table");

  // 🚫 Wedding Exclusion State
  const [excludedWeddingIds, setExcludedWeddingIds] = useState<string[]>([]);
  const [showExcludeModal, setShowExcludeModal] = useState(false);
  const [excludeSearchQuery, setExcludeSearchQuery] = useState("");

  // Selection & Grouping States
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [customGroupNameInput, setCustomGroupNameInput] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);

  // Group Print / PDF State
  const [printGroupData, setPrintGroupData] = useState<{ groupName: string; items: AggregatedItem[] } | null>(null);

  // Role Access Guard
  useEffect(() => {
    if (!loading && (!user || (role === "sales" && !isSuperAdmin))) {
      alert("Unauthorized: Sales team cannot view internal master procurement data.");
      router.push("/handovers");
    }
  }, [user, role, isSuperAdmin, loading, router]);

  // Load all handovers and aggregate procurement datasets
  const loadMasterData = async () => {
    try {
      setLoadingData(true);
      const snap = await getDocs(query(collection(db, "handovers"), orderBy("createdAt", "desc"))).catch(
        () => ({ docs: [] })
      );

      const aggregated: AggregatedItem[] = [];
      const weddingList: { id: string; title: string; date: string }[] = [];

      snap.docs.forEach((d) => {
        const h = d.data();
        const weddingId = d.id;
        const weddingTitle = h.title || h.clientName || "Untitled Wedding";
        const weddingDate = h.weddingDate || h.startDate || h.days?.[0]?.date || "TBD";

        weddingList.push({ id: weddingId, title: weddingTitle, date: weddingDate });
        const budgeting = h.budgeting || {};

        // 1. Natural Flowers
        (budgeting.flowerPurchases || []).forEach((fl: any, idx: number) => {
          aggregated.push({
            id: `flow_${weddingId}_${fl.id || idx}`,
            originalId: fl.id || String(idx),
            sourceType: "flower",
            weddingId,
            weddingTitle,
            weddingDate,
            itemName: fl.name,
            specOrCategory: fl.color ? `Color: ${fl.color}` : "Natural Florals",
            vendorOrVariety: fl.variety || "Mandi Supply",
            unit: fl.unit || "Bunch",
            quantity: Number(fl.quantity) || 1,
            unitCost: Number(fl.unitCost) || 0,
            totalCost: Number(fl.totalCost) || (Number(fl.quantity) || 1) * (Number(fl.unitCost) || 0),
            notes: fl.notes,
            customGroup: fl.customGroup || "",
          });
        });

        // 2. Fresh Consumables
        (budgeting.freshConsumables || []).forEach((c: any, idx: number) => {
          aggregated.push({
            id: `cons_${weddingId}_${c.id || idx}`,
            originalId: c.id || String(idx),
            sourceType: "consumable",
            weddingId,
            weddingTitle,
            weddingDate,
            itemName: c.name,
            specOrCategory: c.category || "Consumables",
            vendorOrVariety: "Raw Materials",
            unit: c.unit || "Unit",
            quantity: Number(c.quantity) || 1,
            unitCost: Number(c.unitCost) || 0,
            totalCost: Number(c.totalCost) || (Number(c.quantity) || 1) * (Number(c.unitCost) || 0),
            notes: c.notes,
            customGroup: c.customGroup || "",
          });
        });

        // 3. Vendor Rentals
        (budgeting.vendorRentals || []).forEach((r: any, idx: number) => {
          aggregated.push({
            id: `rent_${weddingId}_${r.id || idx}`,
            originalId: r.id || String(idx),
            sourceType: "rental",
            weddingId,
            weddingTitle,
            weddingDate,
            itemName: r.itemName,
            specOrCategory: r.size ? `Size: ${r.size}` : "Rental Equipment",
            vendorOrVariety: r.vendorName || "Rental Supplier",
            unit: r.pricingUnit || "Pc",
            quantity: Number(r.quantity) || 1,
            duration: r.isDayApplicable ? `${r.days || 1} Day(s)` : "Single Hire",
            unitCost: Number(r.rate) || 0,
            totalCost: Number(r.totalCost) || 0,
            notes: r.notes,
            customGroup: r.customGroup || "",
          });
        });

        // 4. Labor & Operations
        if (h.laborPlanning?.items) {
          const globalMeal = h.laborPlanning.globalCostPerMeal || 150;
          const globalTravel = h.laborPlanning.globalTravelCost || 800;

          h.laborPlanning.items.forEach((l: any, idx: number) => {
            if (l.headcount > 0) {
              const activeDays = (l.dayShifts || []).filter((day: any) => day.isActive);
              const shifts = l.headcount * activeDays.reduce((sum: number, day: any) => sum + Number(day.shifts || 0), 0);
              const shiftCost = shifts * (Number(l.ratePerShift) || 0);
              const foodCost = l.headcount * activeDays.length * (l.mealsPerDay || 3) * (l.costPerMeal || globalMeal);
              const travelCost = l.headcount * (l.travelCostPerPerson || globalTravel);
              const totalCost = shiftCost + foodCost + travelCost;

              aggregated.push({
                id: `lab_${weddingId}_${idx}`,
                originalId: String(idx),
                sourceType: "labor",
                weddingId,
                weddingTitle,
                weddingDate,
                itemName: l.name,
                specOrCategory: "Labor & Manpower",
                vendorOrVariety: `${activeDays.length} Active Days`,
                unit: "Headcount",
                quantity: Number(l.headcount) || 1,
                duration: `${shifts} total shifts`,
                unitCost: shifts > 0 ? Math.round(totalCost / shifts) : totalCost,
                totalCost,
                notes: `Shifts (₹${shiftCost}) + meals (₹${foodCost}) + travel (₹${travelCost})`,
                customGroup: l.customGroup || "",
              });
            }
          });
        }

        // 5. Capex Purchases
        (budgeting.newPurchases || []).forEach((p: any, idx: number) => {
          aggregated.push({
            id: `pur_${weddingId}_${p.id || idx}`,
            originalId: p.id || String(idx),
            sourceType: "purchase",
            weddingId,
            weddingTitle,
            weddingDate,
            itemName: p.name,
            specOrCategory: p.category || "Capex Purchase",
            vendorOrVariety: p.material || "Purchase",
            unit: "Pcs",
            quantity: Number(p.quantity) || 1,
            unitCost: Number(p.unitCost) || 0,
            totalCost: Number(p.totalCost) || (Number(p.quantity) || 1) * (Number(p.unitCost) || 0),
            notes: p.notes,
            customGroup: p.customGroup || "",
          });
        });
      });

      setAllWeddings(weddingList);
      setAllItems(aggregated);
    } catch (err) {
      console.error("Error loading master procurement data:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user && (role !== "sales" || isSuperAdmin)) {
      loadMasterData();
    }
  }, [user, role, isSuperAdmin]);

  // =========================================================================
  // EXCLUSION LOGIC (FILTERS OUT EXCLUDED WEDDING COMMERCIALS COMPLETELY)
  // =========================================================================
  const toggleExcludeWedding = (weddingId: string) => {
    setExcludedWeddingIds((prev) =>
      prev.includes(weddingId) ? prev.filter((id) => id !== weddingId) : [...prev, weddingId]
    );
  };

  const clearAllExclusions = () => {
    setExcludedWeddingIds([]);
  };

  // Active items excluding any unselected wedding
  const activeItems = useMemo(() => {
    if (excludedWeddingIds.length === 0) return allItems;
    return allItems.filter((item) => !excludedWeddingIds.includes(item.weddingId));
  }, [allItems, excludedWeddingIds]);

  const activeWeddingsCount = useMemo(() => {
    return allWeddings.filter((w) => !excludedWeddingIds.includes(w.id)).length;
  }, [allWeddings, excludedWeddingIds]);

  // Unique Existing Groups
  const existingGroups = useMemo(() => {
    const set = new Set<string>();
    activeItems.forEach((i) => {
      if (i.customGroup && i.customGroup.trim()) {
        set.add(i.customGroup.trim());
      }
    });
    return Array.from(set).sort();
  }, [activeItems]);

  // Overall Financial Metrics (Calculated ONLY on active, non-excluded weddings)
  const metrics = useMemo(() => {
    let flowers = 0;
    let consumables = 0;
    let rentals = 0;
    let labor = 0;
    let purchases = 0;

    activeItems.forEach((i) => {
      if (i.sourceType === "flower") flowers += i.totalCost;
      if (i.sourceType === "consumable") consumables += i.totalCost;
      if (i.sourceType === "rental") rentals += i.totalCost;
      if (i.sourceType === "labor") labor += i.totalCost;
      if (i.sourceType === "purchase") purchases += i.totalCost;
    });

    const grandTotal = flowers + consumables + rentals + labor + purchases;
    return { flowers, consumables, rentals, labor, purchases, grandTotal };
  }, [activeItems]);

  // Filtered List
  const filteredItems = useMemo(() => {
    return activeItems.filter((item) => {
      const matchTab =
        activeTab === "all" ||
        (activeTab === "flowers" && item.sourceType === "flower") ||
        (activeTab === "consumables" && item.sourceType === "consumable") ||
        (activeTab === "rentals" && item.sourceType === "rental") ||
        (activeTab === "labor" && item.sourceType === "labor") ||
        (activeTab === "purchases" && item.sourceType === "purchase");

      const matchWedding = selectedWeddingId === "all" || item.weddingId === selectedWeddingId;

      const matchGroup =
        selectedGroupFilter === "all" ||
        (selectedGroupFilter === "ungrouped" && !item.customGroup) ||
        item.customGroup === selectedGroupFilter;

      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.itemName.toLowerCase().includes(q) ||
        item.weddingTitle.toLowerCase().includes(q) ||
        (item.vendorOrVariety && item.vendorOrVariety.toLowerCase().includes(q)) ||
        (item.specOrCategory && item.specOrCategory.toLowerCase().includes(q)) ||
        (item.customGroup && item.customGroup.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q));

      return matchTab && matchWedding && matchGroup && matchSearch;
    });
  }, [activeItems, activeTab, selectedWeddingId, selectedGroupFilter, searchQuery]);

  const filteredTotalCost = useMemo(() => {
    return filteredItems.reduce((sum, item) => sum + item.totalCost, 0);
  }, [filteredItems]);

  // Grouped Mapping for "Batches" view
  const groupedBatches = useMemo(() => {
    const map: { [groupKey: string]: AggregatedItem[] } = {};
    filteredItems.forEach((it) => {
      const g = it.customGroup?.trim() || "Ungrouped Items";
      if (!map[g]) map[g] = [];
      map[g].push(it);
    });
    return map;
  }, [filteredItems]);

  // Selection toggles
  const handleToggleSelect = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    if (selectedItemIds.length === filteredItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(filteredItems.map((i) => i.id));
    }
  };

  // Assign Custom Group to Selected Items (Across multiple weddings)
  const handleAssignGroup = async (groupNameToAssign: string) => {
    const finalGroup = groupNameToAssign.trim();
    if (!finalGroup) return;

    setSavingGroup(true);
    try {
      const selectedAggregated = allItems.filter((i) => selectedItemIds.includes(i.id));
      const weddingMap: { [weddingId: string]: AggregatedItem[] } = {};

      selectedAggregated.forEach((item) => {
        if (!weddingMap[item.weddingId]) weddingMap[item.weddingId] = [];
        weddingMap[item.weddingId].push(item);
      });

      await Promise.all(
        Object.keys(weddingMap).map(async (wId) => {
          const itemsToUpdate = weddingMap[wId];
          const hRef = doc(db, "handovers", wId);
          const hSnap = await getDoc(hRef);
          if (!hSnap.exists()) return;

          const data = hSnap.data();
          const budgeting = data.budgeting || {};

          // Update Capex Purchases
          const purchases = budgeting.newPurchases || [];
          let purchasesChanged = false;
          const updatedPurchases = purchases.map((p: any, idx: number) => {
            const matches = itemsToUpdate.some(
              (it) => it.sourceType === "purchase" && (it.originalId === p.id || it.originalId === String(idx))
            );
            if (matches) {
              purchasesChanged = true;
              return { ...p, customGroup: finalGroup };
            }
            return p;
          });

          // Update Consumables
          const consumables = budgeting.freshConsumables || [];
          let consumablesChanged = false;
          const updatedConsumables = consumables.map((c: any, idx: number) => {
            const matches = itemsToUpdate.some(
              (it) => it.sourceType === "consumable" && (it.originalId === c.id || it.originalId === String(idx))
            );
            if (matches) {
              consumablesChanged = true;
              return { ...c, customGroup: finalGroup };
            }
            return c;
          });

          // Update Flowers
          const flowers = budgeting.flowerPurchases || [];
          let flowersChanged = false;
          const updatedFlowers = flowers.map((f: any, idx: number) => {
            const matches = itemsToUpdate.some(
              (it) => it.sourceType === "flower" && (it.originalId === f.id || it.originalId === String(idx))
            );
            if (matches) {
              flowersChanged = true;
              return { ...f, customGroup: finalGroup };
            }
            return f;
          });

          // Update Rentals
          const rentals = budgeting.vendorRentals || [];
          let rentalsChanged = false;
          const updatedRentals = rentals.map((r: any, idx: number) => {
            const matches = itemsToUpdate.some(
              (it) => it.sourceType === "rental" && (it.originalId === r.id || it.originalId === String(idx))
            );
            if (matches) {
              rentalsChanged = true;
              return { ...r, customGroup: finalGroup };
            }
            return r;
          });

          const payload: any = { updatedAt: new Date().toISOString() };
          if (purchasesChanged) payload["budgeting.newPurchases"] = updatedPurchases;
          if (consumablesChanged) payload["budgeting.freshConsumables"] = updatedConsumables;
          if (flowersChanged) payload["budgeting.flowerPurchases"] = updatedFlowers;
          if (rentalsChanged) payload["budgeting.vendorRentals"] = updatedRentals;

          if (Object.keys(payload).length > 1) {
            await updateDoc(hRef, payload);
          }
        })
      );

      setShowGroupModal(false);
      setCustomGroupNameInput("");
      setSelectedItemIds([]);
      await loadMasterData();
    } catch (err: any) {
      console.error(err);
      alert("Failed to group items: " + err.message);
    } finally {
      setSavingGroup(false);
    }
  };

  // Remove Grouping
  const handleRemoveGroup = async (groupNameToRemove: string) => {
    if (!window.confirm(`Dissolve group "${groupNameToRemove}"? All items in this group will become ungrouped.`)) return;

    try {
      const itemsInGroup = allItems.filter((i) => i.customGroup === groupNameToRemove);
      const weddingIds = Array.from(new Set(itemsInGroup.map((i) => i.weddingId)));

      await Promise.all(
        weddingIds.map(async (wId) => {
          const hRef = doc(db, "handovers", wId);
          const hSnap = await getDoc(hRef);
          if (!hSnap.exists()) return;

          const data = hSnap.data();
          const budgeting = data.budgeting || {};

          const purchases = (budgeting.newPurchases || []).map((p: any) =>
            p.customGroup === groupNameToRemove ? { ...p, customGroup: "" } : p
          );
          const consumables = (budgeting.freshConsumables || []).map((c: any) =>
            c.customGroup === groupNameToRemove ? { ...c, customGroup: "" } : c
          );
          const flowers = (budgeting.flowerPurchases || []).map((f: any) =>
            f.customGroup === groupNameToRemove ? { ...f, customGroup: "" } : f
          );
          const rentals = (budgeting.vendorRentals || []).map((r: any) =>
            r.customGroup === groupNameToRemove ? { ...r, customGroup: "" } : r
          );

          await updateDoc(hRef, {
            "budgeting.newPurchases": purchases,
            "budgeting.freshConsumables": consumables,
            "budgeting.flowerPurchases": flowers,
            "budgeting.vendorRentals": rentals,
            updatedAt: new Date().toISOString(),
          });
        })
      );

      await loadMasterData();
    } catch (err: any) {
      alert("Failed to dissolve group: " + err.message);
    }
  };

  // Trigger Group PDF Print
  const handlePrintGroup = (groupName: string, items: AggregatedItem[]) => {
    setPrintGroupData({ groupName, items });
    setTimeout(() => {
      window.print();
    }, 200);
  };

  // CSV Export Utility
  const escapeCSV = (value: any) => {
    if (value === null || value === undefined) return '""';
    const stringValue = String(value).replace(/"/g, '""');
    return `"${stringValue}"`;
  };

  const handleDownloadCSV = () => {
    const rows: (string | number)[][] = [
      ["================================================================================"],
      ["CENTRALIZED MASTER PROCUREMENT & LOGISTICS EXPORT"],
      ["Filter Category", activeTab.toUpperCase()],
      ["Filter Wedding", selectedWeddingId === "all" ? "All Active Weddings" : selectedWeddingId],
      ["Excluded Weddings", excludedWeddingIds.length > 0 ? `${excludedWeddingIds.length} Wedding(s) Excluded` : "None"],
      ["Filter Group", selectedGroupFilter],
      ["Export Date", new Date().toLocaleString()],
      ["Total Commercial Spend", `INR ${filteredTotalCost.toLocaleString()}`],
      ["================================================================================"],
      [],
      [
        "Group / Batch Name",
        "Type",
        "Wedding / Project",
        "Wedding Date",
        "Item / Role Name",
        "Category / Spec",
        "Vendor / Origin",
        "Qty",
        "Unit",
        "Duration / Shifts",
        "Rate (INR)",
        "Total Cost (INR)",
        "Notes / Remarks",
      ],
    ];

    filteredItems.forEach((it) => {
      rows.push([
        it.customGroup || "Ungrouped",
        it.sourceType.toUpperCase(),
        it.weddingTitle,
        it.weddingDate,
        it.itemName,
        it.specOrCategory,
        it.vendorOrVariety || "—",
        it.quantity,
        it.unit,
        it.duration || "—",
        it.unitCost,
        it.totalCost,
        it.notes || "—",
      ]);
    });

    const csvContent = "\uFEFF" + rows.map((e) => e.map(escapeCSV).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Master_Procurement_${activeTab}_${selectedGroupFilter !== "all" ? selectedGroupFilter : "all"}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center font-mono text-sm uppercase tracking-wider text-gray-500 font-bold">
        Compiling Centralized Master Procurement Data...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 p-4 sm:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* HEADER */}
        <div className="bg-white p-6 rounded-2xl border-2 border-gray-300 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-indigo-100 text-indigo-900 text-xs uppercase font-black px-2.5 py-0.5 rounded border border-indigo-300">
                Central Operations Desk
              </span>
              <span className="text-xs text-gray-500 font-bold font-mono">
                {activeWeddingsCount} of {allWeddings.length} Weddings Active
              </span>
              {excludedWeddingIds.length > 0 && (
                <span className="bg-rose-100 text-rose-900 text-[10px] font-black px-2 py-0.5 rounded border border-rose-300">
                  🚫 {excludedWeddingIds.length} Excluded
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mt-1">
              Cross-Wedding Master Procurement Hub
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-gray-600 mt-1">
              Group identical items (Candles, Fabrics, Wood) across weddings or exclude weddings from commercial calculations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Manage Excluded Weddings Button */}
            <button
              onClick={() => setShowExcludeModal(true)}
              className={`font-black px-4 py-2.5 rounded-lg text-xs shadow transition flex items-center gap-1.5 border ${
                excludedWeddingIds.length > 0
                  ? "bg-rose-700 hover:bg-rose-800 text-white border-rose-800 animate-pulse"
                  : "bg-white hover:bg-gray-100 text-gray-800 border-gray-300"
              }`}
            >
              <span>🚫</span>
              <span>
                {excludedWeddingIds.length > 0
                  ? `Excluded Weddings (${excludedWeddingIds.length})`
                  : "Exclude Weddings"}
              </span>
            </button>

            <button
              onClick={handleDownloadCSV}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-black px-4 py-2.5 rounded-lg text-xs shadow transition flex items-center gap-1.5"
            >
              📥 Export Filtered CSV
            </button>
            <Link
              href="/handovers"
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold px-4 py-2.5 rounded-lg text-xs border border-gray-300 transition"
            >
              View Handovers
            </Link>
          </div>
        </div>

        {/* 🚫 ACTIVE EXCLUSION NOTIFICATION BAR */}
        {excludedWeddingIds.length > 0 && (
          <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3 font-sans animate-fade-in">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-rose-900 tracking-wide">
                  ⚠️ Commercials Excluded for {excludedWeddingIds.length} Wedding(s)
                </span>
                <span className="text-[11px] text-rose-700 font-medium">
                  (Metrics, item lists, and totals below ignore these weddings)
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {excludedWeddingIds.map((wId) => {
                  const wed = allWeddings.find((w) => w.id === wId);
                  return (
                    <span
                      key={wId}
                      className="inline-flex items-center gap-1.5 bg-rose-200/80 text-rose-950 font-bold text-xs px-2.5 py-1 rounded-lg border border-rose-400"
                    >
                      <span>🚫 {wed?.title || "Wedding"}</span>
                      <button
                        onClick={() => toggleExcludeWedding(wId)}
                        className="text-rose-700 hover:text-black font-black text-xs"
                        title="Include back in calculations"
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>

            <button
              onClick={clearAllExclusions}
              className="text-xs font-black text-rose-900 bg-white border border-rose-300 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition whitespace-nowrap self-end md:self-auto"
            >
              Reset & Include All Weddings
            </button>
          </div>
        )}

        {/* METRIC CARDS (Excludes Omitted Weddings Completely) */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="bg-gray-900 text-white p-4 rounded-xl shadow-sm col-span-2 md:col-span-1">
            <span className="text-[10px] font-black uppercase text-blue-400 block tracking-wider">
              Active Commercial Spend
            </span>
            <span className="text-xl font-black font-mono mt-1 block">₹{metrics.grandTotal.toLocaleString()}</span>
            <span className="text-[10px] text-gray-400 font-bold">
              {activeItems.length} Items across {activeWeddingsCount} Weddings
            </span>
          </div>
          <div className="bg-white p-4 rounded-xl border-2 border-pink-200 shadow-sm">
            <span className="text-[10px] font-black uppercase text-pink-700 block">🌸 Florals</span>
            <span className="text-lg font-black font-mono mt-1 block text-pink-950">₹{metrics.flowers.toLocaleString()}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border-2 border-teal-200 shadow-sm">
            <span className="text-[10px] font-black uppercase text-teal-700 block">🛠️ Consumables</span>
            <span className="text-lg font-black font-mono mt-1 block text-teal-950">₹{metrics.consumables.toLocaleString()}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border-2 border-indigo-200 shadow-sm">
            <span className="text-[10px] font-black uppercase text-indigo-700 block">🚚 Rentals</span>
            <span className="text-lg font-black font-mono mt-1 block text-indigo-950">₹{metrics.rentals.toLocaleString()}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border-2 border-amber-200 shadow-sm">
            <span className="text-[10px] font-black uppercase text-amber-700 block">👷 Labor</span>
            <span className="text-lg font-black font-mono mt-1 block text-amber-950">₹{metrics.labor.toLocaleString()}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border-2 border-blue-200 shadow-sm">
            <span className="text-[10px] font-black uppercase text-blue-700 block">📦 Purchases</span>
            <span className="text-lg font-black font-mono mt-1 block text-blue-950">₹{metrics.purchases.toLocaleString()}</span>
          </div>
        </div>

        {/* CONTROLS & FILTER BAR */}
        <div className="bg-white p-4 rounded-2xl border-2 border-gray-300 shadow-sm space-y-4">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black">
              <button
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 rounded-lg border transition ${
                  activeTab === "all" ? "bg-gray-900 text-white border-gray-900" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                🌐 All Items ({activeItems.length})
              </button>
              <button
                onClick={() => setActiveTab("purchases")}
                className={`px-3 py-1.5 rounded-lg border transition ${
                  activeTab === "purchases" ? "bg-blue-700 text-white border-blue-800" : "bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100"
                }`}
              >
                📦 Capex Purchases
              </button>
              <button
                onClick={() => setActiveTab("consumables")}
                className={`px-3 py-1.5 rounded-lg border transition ${
                  activeTab === "consumables" ? "bg-teal-700 text-white border-teal-800" : "bg-teal-50 text-teal-900 border-teal-200 hover:bg-teal-100"
                }`}
              >
                🛠️ Fresh Consumables
              </button>
              <button
                onClick={() => setActiveTab("rentals")}
                className={`px-3 py-1.5 rounded-lg border transition ${
                  activeTab === "rentals" ? "bg-indigo-700 text-white border-indigo-800" : "bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100"
                }`}
              >
                🚚 Rentals
              </button>
              <button
                onClick={() => setActiveTab("flowers")}
                className={`px-3 py-1.5 rounded-lg border transition ${
                  activeTab === "flowers" ? "bg-pink-700 text-white border-pink-800" : "bg-pink-50 text-pink-900 border-pink-200 hover:bg-pink-100"
                }`}
              >
                🌸 Flowers
              </button>
              <button
                onClick={() => setActiveTab("labor")}
                className={`px-3 py-1.5 rounded-lg border transition ${
                  activeTab === "labor" ? "bg-amber-600 text-white border-amber-700" : "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
                }`}
              >
                👷 Labor
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-300 text-xs font-bold">
              <button
                onClick={() => setViewMode("table")}
                className={`px-3 py-1 rounded-lg transition ${
                  viewMode === "table" ? "bg-white text-gray-900 shadow font-black" : "text-gray-600 hover:text-black"
                }`}
              >
                📋 Line Item Table
              </button>
              <button
                onClick={() => setViewMode("grouped")}
                className={`px-3 py-1 rounded-lg transition flex items-center gap-1 ${
                  viewMode === "grouped" ? "bg-indigo-700 text-white shadow font-black" : "text-gray-600 hover:text-black"
                }`}
              >
                📑 Grouped Batches ({Object.keys(groupedBatches).length})
              </button>
            </div>
          </div>

          {/* Secondary Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <input
                placeholder="Search item, vendor, wedding, or group..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-72 border-2 border-gray-300 p-2 rounded-lg font-bold bg-white outline-none"
              />

              <select
                value={selectedWeddingId}
                onChange={(e) => setSelectedWeddingId(e.target.value)}
                className="w-full sm:w-56 border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
              >
                <option value="all">✨ All Active Weddings ({activeWeddingsCount})</option>
                {allWeddings
                  .filter((w) => !excludedWeddingIds.includes(w.id))
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title} ({w.date})
                    </option>
                  ))}
              </select>

              <select
                value={selectedGroupFilter}
                onChange={(e) => setSelectedGroupFilter(e.target.value)}
                className="w-full sm:w-56 border-2 border-indigo-300 p-2 rounded-lg font-bold bg-indigo-50/50"
              >
                <option value="all">🏷️ All Custom Groups</option>
                <option value="ungrouped">⚠️ Ungrouped Items Only</option>
                {existingGroups.map((g) => (
                  <option key={g} value={g}>
                    📦 Group: {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="font-mono text-xs font-bold text-gray-700 flex items-center gap-2 self-end sm:self-auto">
              <span>Showing {filteredItems.length} lines</span>
              <span className="bg-gray-100 px-2 py-1 rounded border">
                Subtotal: <strong className="text-gray-950 font-black">₹{filteredTotalCost.toLocaleString()}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* BATCH ACTION BAR (WHEN ITEMS ARE SELECTED) */}
        {selectedItemIds.length > 0 && (
          <div className="sticky bottom-6 z-40 bg-gray-950 text-white p-4 rounded-2xl shadow-2xl border-2 border-indigo-400 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in font-sans">
            <div className="flex items-center gap-3">
              <span className="bg-indigo-600 text-white text-xs font-black px-2.5 py-1 rounded-full">
                {selectedItemIds.length} Selected
              </span>
              <p className="text-xs font-semibold text-gray-300">
                Group identical items from multiple weddings together (e.g. bulk candles, fabrics, scaffolding) for joint ordering.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedItemIds([])}
                className="text-xs font-bold text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800"
              >
                Deselect All
              </button>
              <button
                onClick={() => {
                  setCustomGroupNameInput("");
                  setShowGroupModal(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-4 py-2 rounded-xl text-xs shadow transition flex items-center gap-1.5"
              >
                🏷️ Group Selected Items ({selectedItemIds.length})
              </button>
            </div>
          </div>
        )}

        {/* VIEW 1: LINE ITEM TABLE */}
        {viewMode === "table" && (
          <div className="bg-white rounded-2xl border-2 border-gray-300 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-gray-100 text-[10px] font-black uppercase text-gray-700 border-b border-gray-300">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedItemIds.length > 0 && selectedItemIds.length === filteredItems.length}
                        onChange={handleSelectAllFiltered}
                        className="h-4 w-4 rounded cursor-pointer"
                        title="Select All Filtered"
                      />
                    </th>
                    <th className="p-3">Category & Group</th>
                    <th className="p-3">Wedding / Project</th>
                    <th className="p-3">Item / Service Details</th>
                    <th className="p-3">Supplier / Spec</th>
                    <th className="p-3 text-center">Quantity</th>
                    <th className="p-3 text-right">Unit Rate (₹)</th>
                    <th className="p-3 text-right">Total Cost (₹)</th>
                    <th className="p-3">Notes</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-12 text-center text-gray-400 font-bold italic">
                        No procurement items found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((it) => {
                      const isSelected = selectedItemIds.includes(it.id);

                      let badgeColor = "bg-gray-100 text-gray-800 border-gray-300";
                      let typeLabel = "General";

                      if (it.sourceType === "flower") {
                        badgeColor = "bg-pink-100 text-pink-900 border-pink-300";
                        typeLabel = "🌸 Flower";
                      } else if (it.sourceType === "consumable") {
                        badgeColor = "bg-teal-100 text-teal-900 border-teal-300";
                        typeLabel = "🛠️ Consumable";
                      } else if (it.sourceType === "rental") {
                        badgeColor = "bg-indigo-100 text-indigo-900 border-indigo-300";
                        typeLabel = "🚚 Rental";
                      } else if (it.sourceType === "labor") {
                        badgeColor = "bg-amber-100 text-amber-900 border-amber-300";
                        typeLabel = "👷 Labor";
                      } else if (it.sourceType === "purchase") {
                        badgeColor = "bg-blue-100 text-blue-900 border-blue-300";
                        typeLabel = "📦 Capex";
                      }

                      return (
                        <tr key={it.id} className={`hover:bg-slate-50 transition ${isSelected ? "bg-indigo-50/60" : ""}`}>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(it.id)}
                              className="h-4 w-4 rounded cursor-pointer"
                            />
                          </td>
                          <td className="p-3 whitespace-nowrap space-y-1">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border block w-fit ${badgeColor}`}>
                              {typeLabel}
                            </span>
                            {it.customGroup ? (
                              <span className="text-[10px] font-black bg-purple-100 text-purple-900 border border-purple-300 px-1.5 py-0.5 rounded block w-fit">
                                🏷️ {it.customGroup}
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400 block font-semibold">Ungrouped</span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-gray-900 block">{it.weddingTitle}</span>
                              <button
                                onClick={() => toggleExcludeWedding(it.weddingId)}
                                className="text-[9px] text-gray-400 hover:text-rose-600 font-bold"
                                title="Exclude this wedding from master commercials"
                              >
                                🚫 Exclude
                              </button>
                            </div>
                            <span className="text-[10px] text-gray-500 font-sans">{it.weddingDate}</span>
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-gray-900">{it.itemName}</span>
                            {it.duration && <span className="text-[10px] text-purple-800 ml-1 font-bold">({it.duration})</span>}
                          </td>
                          <td className="p-3 text-gray-600">
                            <div>{it.vendorOrVariety || "—"}</div>
                            <div className="text-[10px] text-gray-400">{it.specOrCategory}</div>
                          </td>
                          <td className="p-3 text-center font-bold text-gray-800 whitespace-nowrap">
                            {it.quantity} {it.unit}
                          </td>
                          <td className="p-3 text-right font-bold text-gray-700 whitespace-nowrap">
                            ₹{it.unitCost.toLocaleString()}
                          </td>
                          <td className="p-3 text-right font-black text-gray-950 text-sm whitespace-nowrap">
                            ₹{it.totalCost.toLocaleString()}
                          </td>
                          <td className="p-3 text-gray-500 text-[11px] max-w-xs truncate" title={it.notes || ""}>
                            {it.notes || "—"}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <Link
                              href={`/handovers/${it.weddingId}/budget`}
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-2.5 py-1 rounded border border-indigo-200 transition text-[10px]"
                            >
                              Budget ↗
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW 2: GROUPED BATCHES ACCORDIONS */}
        {viewMode === "grouped" && (
          <div className="space-y-6">
            {Object.keys(groupedBatches).map((groupName) => {
              const items = groupedBatches[groupName];
              const totalCost = items.reduce((sum, i) => sum + i.totalCost, 0);
              const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);
              const isUngrouped = groupName === "Ungrouped Items";

              return (
                <div
                  key={groupName}
                  className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${
                    isUngrouped ? "border-gray-300" : "border-indigo-400"
                  }`}
                >
                  {/* Group Header */}
                  <div
                    className={`p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b ${
                      isUngrouped ? "bg-gray-50 border-gray-200" : "bg-indigo-50/80 border-indigo-200"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                            isUngrouped
                              ? "bg-gray-200 text-gray-700 border-gray-300"
                              : "bg-indigo-700 text-white border-indigo-800"
                          }`}
                        >
                          {isUngrouped ? "Unbatched" : "Bulk Buying Group"}
                        </span>
                        <h3 className="text-lg font-black text-gray-900">{groupName}</h3>
                      </div>
                      <p className="text-xs text-gray-500 font-semibold mt-0.5">
                        {items.length} line item(s) • Total Quantity: <strong>{totalUnits} units</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-base font-black text-indigo-950 bg-white border border-indigo-200 px-3 py-1.5 rounded-lg shadow-sm">
                        Batch Total: ₹{totalCost.toLocaleString()}
                      </span>

                      {!isUngrouped && (
                        <>
                          <button
                            onClick={() => handlePrintGroup(groupName, items)}
                            className="bg-indigo-700 hover:bg-indigo-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow transition flex items-center gap-1"
                            title="Open Print Dialog to save/download PDF for this group"
                          >
                            📄 Download / Print Group PDF
                          </button>
                          <button
                            onClick={() => handleRemoveGroup(groupName)}
                            className="text-red-600 hover:text-red-800 text-xs font-bold hover:underline"
                            title="Dissolve group"
                          >
                            Dissolve
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Group Items Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-600 border-b">
                        <tr>
                          <th className="p-3">Target Wedding</th>
                          <th className="p-3">Item Name</th>
                          <th className="p-3">Material / Size Spec</th>
                          <th className="p-3 text-center">Qty</th>
                          <th className="p-3 text-right">Unit Rate (₹)</th>
                          <th className="p-3 text-right">Subtotal (₹)</th>
                          <th className="p-3">Sourcing Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {items.map((it) => (
                          <tr key={it.id} className="hover:bg-slate-50">
                            <td className="p-3">
                              <span className="font-bold text-gray-900">{it.weddingTitle}</span>
                              <span className="text-[10px] text-gray-500 block font-sans">{it.weddingDate}</span>
                            </td>
                            <td className="p-3 font-bold text-gray-900">
                              {it.itemName}
                            </td>
                            <td className="p-3 text-gray-600">
                              {it.specOrCategory} {it.vendorOrVariety && `• ${it.vendorOrVariety}`}
                            </td>
                            <td className="p-3 text-center font-bold text-gray-900">
                              {it.quantity} {it.unit}
                            </td>
                            <td className="p-3 text-right font-bold text-gray-700">
                              ₹{it.unitCost.toLocaleString()}
                            </td>
                            <td className="p-3 text-right font-black text-indigo-950">
                              ₹{it.totalCost.toLocaleString()}
                            </td>
                            <td className="p-3 text-gray-500 text-[11px] max-w-xs truncate">
                              {it.notes || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: EXCLUDE WEDDINGS MANAGER */}
      {/* ========================================================================= */}
      {showExcludeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm font-sans">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border-2 border-rose-400 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <h3 className="text-base font-black text-gray-900 uppercase">
                  Exclude Weddings from Procurement Commercials
                </h3>
                <p className="text-[11px] text-gray-500">
                  Select any weddings to omit from master commercial totals, procurement lists, and exports.
                </p>
              </div>
              <button
                onClick={() => setShowExcludeModal(false)}
                className="text-gray-400 hover:text-black font-black text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <input
                placeholder="Search wedding to exclude/include..."
                value={excludeSearchQuery}
                onChange={(e) => setExcludeSearchQuery(e.target.value)}
                className="w-full border-2 border-gray-300 p-2 rounded-lg text-xs font-bold outline-none"
              />

              <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-xl pr-1 text-xs">
                {allWeddings
                  .filter((w) =>
                    !excludeSearchQuery ||
                    w.title.toLowerCase().includes(excludeSearchQuery.toLowerCase()) ||
                    w.date.toLowerCase().includes(excludeSearchQuery.toLowerCase())
                  )
                  .map((w) => {
                    const isExcluded = excludedWeddingIds.includes(w.id);
                    return (
                      <div
                        key={w.id}
                        onClick={() => toggleExcludeWedding(w.id)}
                        className={`p-3 flex items-center justify-between cursor-pointer transition rounded-lg ${
                          isExcluded ? "bg-rose-50 text-rose-950 font-bold" : "hover:bg-gray-50"
                        }`}
                      >
                        <div>
                          <div className="font-black text-xs">{w.title}</div>
                          <div className="text-[10px] text-gray-500 font-sans">Event Date: {w.date}</div>
                        </div>

                        <span
                          className={`text-[10px] font-black px-2.5 py-1 rounded-md border ${
                            isExcluded
                              ? "bg-rose-600 text-white border-rose-700"
                              : "bg-emerald-50 text-emerald-800 border-emerald-300"
                          }`}
                        >
                          {isExcluded ? "🚫 Excluded" : "✓ Active"}
                        </span>
                      </div>
                    );
                  })}
              </div>

              <div className="flex items-center justify-between pt-2 border-t text-xs">
                <button
                  type="button"
                  onClick={clearAllExclusions}
                  className="text-rose-600 hover:text-rose-800 font-bold hover:underline"
                >
                  Reset (Include All)
                </button>
                <button
                  type="button"
                  onClick={() => setShowExcludeModal(false)}
                  className="px-5 py-2 bg-gray-900 hover:bg-black text-white font-black rounded-lg text-xs shadow"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ASSIGN CUSTOM GROUP */}
      {/* ========================================================================= */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm font-sans">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border-2 border-indigo-400 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <h3 className="text-base font-black text-gray-900 uppercase">
                  Batch Grouping for Wholesale Order
                </h3>
                <p className="text-[11px] text-gray-500">
                  {selectedItemIds.length} item(s) selected across multiple projects
                </p>
              </div>
              <button
                onClick={() => setShowGroupModal(false)}
                className="text-gray-400 hover:text-black font-black text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-black text-gray-800 mb-1 uppercase">
                  1. Enter Custom Group Name *
                </label>
                <input
                  placeholder="e.g. Candles Bulk Order - Sadar Bazar, Fabrics Wholesale"
                  value={customGroupNameInput}
                  onChange={(e) => setCustomGroupNameInput(e.target.value)}
                  className="w-full border-2 border-indigo-400 p-2 rounded-lg font-bold bg-white text-gray-900 outline-none"
                />
              </div>

              {existingGroups.length > 0 && (
                <div>
                  <label className="block font-black text-gray-600 mb-1 uppercase">
                    Or select an existing group:
                  </label>
                  <select
                    value=""
                    onChange={(e) => setCustomGroupNameInput(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-gray-50"
                  >
                    <option value="">-- Choose existing group --</option>
                    {existingGroups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200 text-indigo-950 text-[11px] font-medium">
                💡 <strong>Tip:</strong> Grouping creates a unified wholesale procurement list. You can view, filter, and print this specific purchase order at any time.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="px-4 py-2 border font-bold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingGroup || !customGroupNameInput.trim()}
                  onClick={() => handleAssignGroup(customGroupNameInput)}
                  className="px-5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white font-black rounded-lg text-xs shadow disabled:opacity-50"
                >
                  {savingGroup ? "Grouping..." : "Confirm & Save Group"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRINT-ONLY COMPONENT (ACTIVATED FOR PDF EXPORT OF SPECIFIC GROUP) */}
      {printGroupData && (
        <div id="print-group-section" className="hidden print:block fixed inset-0 bg-white p-8 text-black z-50">
          <div className="border-b-2 border-black pb-4 mb-4 flex justify-between items-start">
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-gray-600">
                BRAJWAL EVENTS • WHOLESALE PROCUREMENT ORDER
              </span>
              <h1 className="text-2xl font-black mt-1">BATCH: {printGroupData.groupName}</h1>
              <p className="text-xs text-gray-600 mt-0.5">
                Generated on: {new Date().toLocaleString()} • Consolidated Multi-Wedding Order
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs uppercase font-bold text-gray-500 block">Total Estimated Cost</span>
              <span className="text-2xl font-mono font-black">
                ₹{printGroupData.items.reduce((s, i) => s + i.totalCost, 0).toLocaleString()}
              </span>
            </div>
          </div>

          <table className="w-full text-left text-xs font-mono border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300">
                <th className="p-2 border-r border-gray-300">#</th>
                <th className="p-2 border-r border-gray-300">Target Wedding Project</th>
                <th className="p-2 border-r border-gray-300">Item Name & Specs</th>
                <th className="p-2 border-r border-gray-300 text-center">Qty / Unit</th>
                <th className="p-2 border-r border-gray-300 text-right">Unit Rate (₹)</th>
                <th className="p-2 border-r border-gray-300 text-right">Subtotal (₹)</th>
                <th className="p-2">Sourcing Instructions</th>
              </tr>
            </thead>
            <tbody>
              {printGroupData.items.map((it, idx) => (
                <tr key={it.id} className="border-b border-gray-200">
                  <td className="p-2 border-r border-gray-300 font-bold">{idx + 1}</td>
                  <td className="p-2 border-r border-gray-300">
                    <strong>{it.weddingTitle}</strong>
                    <div className="text-[10px] text-gray-600">{it.weddingDate}</div>
                  </td>
                  <td className="p-2 border-r border-gray-300">
                    <strong>{it.itemName}</strong>
                    <div className="text-[10px] text-gray-600">{it.specOrCategory}</div>
                  </td>
                  <td className="p-2 border-r border-gray-300 text-center font-bold">
                    {it.quantity} {it.unit}
                  </td>
                  <td className="p-2 border-r border-gray-300 text-right">
                    ₹{it.unitCost.toLocaleString()}
                  </td>
                  <td className="p-2 border-r border-gray-300 text-right font-black">
                    ₹{it.totalCost.toLocaleString()}
                  </td>
                  <td className="p-2 text-[10px]">
                    {it.notes || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-black bg-gray-100 border-t-2 border-black">
                <td colSpan={3} className="p-2 border-r border-gray-300 text-right">
                  CONSOLIDATED BATCH TOTALS:
                </td>
                <td className="p-2 border-r border-gray-300 text-center">
                  {printGroupData.items.reduce((s, i) => s + i.quantity, 0)} Units
                </td>
                <td className="p-2 border-r border-gray-300"></td>
                <td className="p-2 border-r border-gray-300 text-right">
                  ₹{printGroupData.items.reduce((s, i) => s + i.totalCost, 0).toLocaleString()}
                </td>
                <td className="p-2"></td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-8 pt-4 border-t border-gray-300 flex justify-between text-xs text-gray-600">
            <div>
              <p>Prepared By: _________________________</p>
              <p className="mt-1">Production Operations Desk</p>
            </div>
            <div>
              <p>Wholesale Vendor / Receiver Sign: _________________________</p>
              <p className="mt-1">Date: _________________________</p>
            </div>
          </div>
        </div>
      )}

      {/* PRINT-OPTIMIZED CSS */}
      <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          header, nav, button, .sticky, input, select {
            display: none !important;
          }
          #print-group-section {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}