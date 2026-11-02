"use client";
import React, { useState, useEffect, useMemo } from "react";
import { db } from "../../lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy
} from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";

interface ConsumableItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  customUnit?: string;
  approxPrice: number;
  remarks?: string;
  createdAt: string;
}

export default function FreshConsumablesLibraryPage() {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  const isProduction = role === "production";
  const isAdmin = role === "admin" || isSuperAdmin;
  const canAccess = isAdmin || isProduction;

  const [consumables, setConsumables] = useState<ConsumableItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ConsumableItem | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("Flex & Printing");
  const [unitInput, setUnitInput] = useState("Per Meter");
  const [customUnitInput, setCustomUnitInput] = useState("");
  const [priceInput, setPriceInput] = useState<number | "">("");
  const [remarksInput, setRemarksInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const defaultCategories = [
    "Flex & Printing",
    "Thermocol & Carvings",
    "Fabrics & Linens",
    "Hardware & Wooden Scaffolding",
    "Candles & Glassware",
    "Packaging & Boxes",
    "Stationery & Paper",
    "Electrical & Tapes",
    "Other Raw Materials"
  ];

  useEffect(() => {
    if (!loading && (!user || !canAccess)) {
      alert("Unauthorized: Only the Production team and Admins can access the Fresh Consumables Library.");
      router.push("/handovers");
    }
  }, [user, role, isSuperAdmin, loading, canAccess, router]);

  const loadConsumables = async () => {
    try {
      setLoadingData(true);
      const snap = await getDocs(
        query(collection(db, "fresh_consumables_library"), orderBy("name", "asc"))
      ).catch(() => ({ docs: [] }));

      setConsumables(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConsumableItem)));
    } catch (err) {
      console.error("Error loading consumables:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user && canAccess) {
      loadConsumables();
    }
  }, [user, canAccess]);

  const openNewModal = () => {
    setEditingItem(null);
    setNameInput("");
    setCategoryInput("Flex & Printing");
    setUnitInput("Per Meter");
    setCustomUnitInput("");
    setPriceInput("");
    setRemarksInput("");
    setShowModal(true);
  };

  const openEditModal = (item: ConsumableItem) => {
    setEditingItem(item);
    setNameInput(item.name);
    setCategoryInput(item.category || "Flex & Printing");
    setUnitInput(item.unit || "Per Meter");
    setCustomUnitInput(item.customUnit || "");
    setPriceInput(item.approxPrice);
    setRemarksInput(item.remarks || "");
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || priceInput === "") return;

    setSubmitting(true);
    try {
      const payload = {
        name: nameInput.trim(),
        category: categoryInput.trim(),
        unit: unitInput,
        customUnit: unitInput === "Custom Unit" ? customUnitInput.trim() : "",
        approxPrice: Number(priceInput),
        remarks: remarksInput.trim(),
        updatedAt: new Date().toISOString(),
      };

      if (editingItem) {
        await updateDoc(doc(db, "fresh_consumables_library", editingItem.id), payload);
      } else {
        await addDoc(collection(db, "fresh_consumables_library"), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
      }

      setShowModal(false);
      await loadConsumables();
    } catch (err: any) {
      alert("Failed to save consumable: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: ConsumableItem) => {
    if (!window.confirm(`Delete "${item.name}" from the consumables catalog?`)) return;
    try {
      await deleteDoc(doc(db, "fresh_consumables_library", item.id));
      setConsumables((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err: any) {
      alert("Failed to delete consumable: " + err.message);
    }
  };

  const categories = useMemo(() => {
    return ["All", ...Array.from(new Set([...defaultCategories, ...consumables.map((c) => c.category).filter(Boolean)]))];
  }, [consumables]);

  const filteredConsumables = useMemo(() => {
    return consumables.filter((c) => {
      const matchCat = filterCategory === "All" || c.category === filterCategory;
      const matchSearch =
        !searchQuery.trim() ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        (c.remarks && c.remarks.toLowerCase().includes(searchQuery.toLowerCase().trim()));

      return matchCat && matchSearch;
    });
  }, [consumables, filterCategory, searchQuery]);

  if (loading || loadingData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center font-mono text-sm uppercase tracking-wider text-gray-500 font-bold">
        Loading Fresh Consumables Library...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 sm:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border-2 border-gray-300 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-teal-100 text-teal-900 text-xs uppercase font-black px-2.5 py-0.5 rounded border border-teal-300">
                Master Materials Catalog
              </span>
              <span className="text-xs text-gray-500 font-bold font-mono">
                {consumables.length} Items Cataloged
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mt-1">Fresh Consumables Library</h1>
            <p className="text-xs sm:text-sm font-semibold text-gray-600 mt-1">
              Maintain standard purchase prices for raw consumables (Thermocol, Flex, Foam, Candles, Fabric, Hardware).
            </p>
          </div>

          <button
            onClick={openNewModal}
            className="bg-teal-700 hover:bg-teal-800 text-white font-black px-5 py-2.5 rounded-lg text-xs shadow transition flex items-center gap-1.5 self-start md:self-auto"
          >
            + Add Consumable Item
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-white p-4 rounded-xl border-2 border-gray-300 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 font-mono text-xs">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <input
              placeholder="Search consumable or note..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-80 border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-gray-900 outline-none"
            />

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="font-black text-gray-700 whitespace-nowrap">Category:</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-gray-900 outline-none w-full sm:w-60"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat === "All" ? "✨ All Categories" : cat}</option>
                ))}
              </select>
            </div>
          </div>

          <span className="text-gray-500 font-bold">
            Showing {filteredConsumables.length} of {consumables.length}
          </span>
        </div>

        {/* Table View */}
        <div className="bg-white rounded-2xl border-2 border-gray-300 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-teal-50 text-[10px] font-black uppercase text-teal-950 border-b border-teal-200">
                <tr>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Consumable Item</th>
                  <th className="p-3.5">Pricing Unit</th>
                  <th className="p-3.5 text-right">Approx Purchase Rate (₹)</th>
                  <th className="p-3.5">Sourcing Remarks / Notes</th>
                  <th className="p-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-medium">
                {filteredConsumables.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-gray-400 font-bold">
                      No consumables found matching the search/filter.
                    </td>
                  </tr>
                ) : (
                  filteredConsumables.map((c) => {
                    const unitDisplay = c.unit === "Custom Unit" ? c.customUnit : c.unit;

                    return (
                      <tr key={c.id} className="hover:bg-teal-50/40">
                        <td className="p-3.5 whitespace-nowrap">
                          <span className="text-[10px] font-black uppercase bg-teal-100 text-teal-900 px-2 py-0.5 rounded border border-teal-200">
                            {c.category || "General"}
                          </span>
                        </td>
                        <td className="p-3.5 font-bold text-gray-900 text-sm">
                          ✨ {c.name}
                        </td>
                        <td className="p-3.5 text-gray-600 whitespace-nowrap">
                          {unitDisplay}
                        </td>
                        <td className="p-3.5 text-right font-black text-teal-950 text-sm whitespace-nowrap">
                          ₹{c.approxPrice.toLocaleString()}
                        </td>
                        <td className="p-3.5 text-gray-600 text-[11px] max-w-sm">
                          {c.remarks || "—"}
                        </td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openEditModal(c)}
                              className="text-blue-600 hover:text-blue-800 font-bold px-2.5 py-1 rounded hover:bg-blue-50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(c)}
                              className="text-red-600 hover:text-red-800 font-bold px-2.5 py-1 rounded hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* MODAL: CREATE / EDIT CONSUMABLE */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border-2 border-teal-500 shadow-2xl space-y-4 font-sans">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-base font-black text-teal-950 uppercase">
                {editingItem ? "Edit Consumable Item" : "Add Fresh Consumable"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-black font-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block font-black text-gray-800 mb-1 uppercase">Item Name *</label>
                <input
                  required
                  placeholder="e.g. Thermocol Sheets 2-inch, Flex 340gsm, T-Light Candles"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-gray-900 outline-none"
                />
              </div>

              <div>
                <label className="block font-black text-gray-800 mb-1 uppercase">Category *</label>
                <select
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                >
                  {defaultCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-gray-800 mb-1 uppercase">Pricing Unit *</label>
                  <select
                    value={unitInput}
                    onChange={(e) => setUnitInput(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                  >
                    <option value="Per Meter">Per Meter</option>
                    <option value="Per Sheet">Per Sheet</option>
                    <option value="Per Pc">Per Pc</option>
                    <option value="Per Box">Per Box</option>
                    <option value="Per Roll">Per Roll</option>
                    <option value="Per Bundle">Per Bundle</option>
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
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold text-right bg-white font-mono"
                  />
                </div>
              </div>

              {unitInput === "Custom Unit" && (
                <div>
                  <label className="block font-black text-teal-950 mb-1 uppercase">Specify Custom Unit *</label>
                  <input
                    required
                    placeholder="e.g. Per 50 Pcs, Per Pack of 100"
                    value={customUnitInput}
                    onChange={(e) => setCustomUnitInput(e.target.value)}
                    className="w-full border-2 border-teal-400 p-2 rounded-lg font-bold bg-white"
                  />
                </div>
              )}

              <div>
                <label className="block font-black text-gray-800 mb-1 uppercase">Sourcing Remarks / Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Wholesale rate from Sadar Bazar, buy 3 days before setup"
                  value={remarksInput}
                  onChange={(e) => setRemarksInput(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border font-bold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white font-black rounded-lg shadow disabled:opacity-50"
                >
                  {submitting ? "Saving..." : editingItem ? "Update Consumable" : "Save Consumable"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}