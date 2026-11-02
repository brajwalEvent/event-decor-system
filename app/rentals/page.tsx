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

interface RentalVendor {
  id: string;
  name: string;
  phone?: string;
  city?: string;
  notes?: string;
  createdAt: string;
}

interface RentalItem {
  id: string;
  vendorId: string;
  vendorName: string;
  itemName: string;
  size?: string;
  rate: number;
  pricingUnit: string;
  customUnit?: string;
  isDayApplicable: boolean;
  remarks?: string;
  createdAt: string;
  updatedAt?: string;
}

export default function VendorRentalsLibraryPage() {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  const isProduction = role === "production";
  const isAdmin = role === "admin" || isSuperAdmin;
  const canAccess = isAdmin || isProduction;

  const [vendors, setVendors] = useState<RentalVendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<RentalVendor | null>(null);
  const [rentalItems, setRentalItems] = useState<RentalItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Search & Filter
  const [vendorSearch, setVendorSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");

  // Modals
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<RentalVendor | null>(null);
  const [vendorNameInput, setVendorNameInput] = useState("");
  const [vendorPhoneInput, setVendorPhoneInput] = useState("");
  const [vendorCityInput, setVendorCityInput] = useState("");
  const [vendorNotesInput, setVendorNotesInput] = useState("");
  const [submittingVendor, setSubmittingVendor] = useState(false);

  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<RentalItem | null>(null);
  const [itemNameInput, setItemNameInput] = useState("");
  const [itemSizeInput, setItemSizeInput] = useState("");
  const [itemRateInput, setItemRateInput] = useState<number | "">("");
  const [itemUnitInput, setItemUnitInput] = useState("Per Pc");
  const [itemCustomUnitInput, setItemCustomUnitInput] = useState("");
  const [itemIsDayApplicable, setItemIsDayApplicable] = useState(false);
  const [itemRemarksInput, setItemRemarksInput] = useState("");
  const [submittingItem, setSubmittingItem] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !canAccess)) {
      alert("Unauthorized: Only the Production team and Admins can access the Vendor Rentals Library.");
      router.push("/handovers");
    }
  }, [user, role, isSuperAdmin, loading, canAccess, router]);

  const loadData = async () => {
    try {
      setLoadingData(true);
      const [vSnap, rSnap] = await Promise.all([
        getDocs(query(collection(db, "rental_vendors"), orderBy("name", "asc"))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, "vendor_rentals_library"), orderBy("itemName", "asc"))).catch(() => ({ docs: [] })),
      ]);

      const vList = vSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RentalVendor));
      const rList = rSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RentalItem));

      setVendors(vList);
      setRentalItems(rList);

      if (vList.length > 0) {
        setSelectedVendor((prev) => (prev ? vList.find((v) => v.id === prev.id) || vList[0] : vList[0]));
      }
    } catch (err) {
      console.error("Error loading rentals data:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user && canAccess) {
      loadData();
    }
  }, [user, canAccess]);

  // Vendor CRUD
  const openNewVendorModal = () => {
    setEditingVendor(null);
    setVendorNameInput("");
    setVendorPhoneInput("");
    setVendorCityInput("");
    setVendorNotesInput("");
    setShowVendorModal(true);
  };

  const openEditVendorModal = (v: RentalVendor) => {
    setEditingVendor(v);
    setVendorNameInput(v.name);
    setVendorPhoneInput(v.phone || "");
    setVendorCityInput(v.city || "");
    setVendorNotesInput(v.notes || "");
    setShowVendorModal(true);
  };

  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorNameInput.trim()) return;

    setSubmittingVendor(true);
    try {
      const payload = {
        name: vendorNameInput.trim(),
        phone: vendorPhoneInput.trim(),
        city: vendorCityInput.trim(),
        notes: vendorNotesInput.trim(),
        updatedAt: new Date().toISOString(),
      };

      if (editingVendor) {
        await updateDoc(doc(db, "rental_vendors", editingVendor.id), payload);

        // Update vendorName on all their rental items
        const vendorRelatedItems = rentalItems.filter((i) => i.vendorId === editingVendor.id);
        for (const it of vendorRelatedItems) {
          await updateDoc(doc(db, "vendor_rentals_library", it.id), {
            vendorName: payload.name,
          });
        }
      } else {
        const ref = await addDoc(collection(db, "rental_vendors"), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
        setSelectedVendor({ id: ref.id, ...payload, createdAt: new Date().toISOString() });
      }

      setShowVendorModal(false);
      await loadData();
    } catch (err: any) {
      alert("Failed to save vendor: " + err.message);
    } finally {
      setSubmittingVendor(false);
    }
  };

  const handleDeleteVendor = async (v: RentalVendor) => {
    const count = rentalItems.filter((i) => i.vendorId === v.id).length;
    const confirmMsg = count > 0
      ? `Delete vendor "${v.name}" and all ${count} rental item(s) in their catalog?`
      : `Delete vendor "${v.name}"?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteDoc(doc(db, "rental_vendors", v.id));

      const vendorRelatedItems = rentalItems.filter((i) => i.vendorId === v.id);
      for (const it of vendorRelatedItems) {
        await deleteDoc(doc(db, "vendor_rentals_library", it.id));
      }

      await loadData();
      setSelectedVendor(null);
    } catch (err: any) {
      alert("Failed to delete vendor: " + err.message);
    }
  };

  // Item CRUD
  const openNewItemModal = () => {
    if (!selectedVendor) return alert("Select a vendor first.");
    setEditingItem(null);
    setItemNameInput("");
    setItemSizeInput("");
    setItemRateInput("");
    setItemUnitInput("Per Pc");
    setItemCustomUnitInput("");
    setItemIsDayApplicable(false);
    setItemRemarksInput("");
    setShowItemModal(true);
  };

  const openEditItemModal = (it: RentalItem) => {
    setEditingItem(it);
    setItemNameInput(it.itemName);
    setItemSizeInput(it.size || "");
    setItemRateInput(it.rate);
    setItemUnitInput(it.pricingUnit || "Per Pc");
    setItemCustomUnitInput(it.customUnit || "");
    setItemIsDayApplicable(Boolean(it.isDayApplicable));
    setItemRemarksInput(it.remarks || "");
    setShowItemModal(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendor || !itemNameInput.trim() || itemRateInput === "") return;

    setSubmittingItem(true);
    try {
      const payload = {
        vendorId: selectedVendor.id,
        vendorName: selectedVendor.name,
        itemName: itemNameInput.trim(),
        size: itemSizeInput.trim(),
        rate: Number(itemRateInput),
        pricingUnit: itemUnitInput,
        customUnit: itemUnitInput === "Custom Unit" ? itemCustomUnitInput.trim() : "",
        isDayApplicable: itemIsDayApplicable,
        remarks: itemRemarksInput.trim(),
        updatedAt: new Date().toISOString(),
      };

      if (editingItem) {
        await updateDoc(doc(db, "vendor_rentals_library", editingItem.id), payload);
      } else {
        await addDoc(collection(db, "vendor_rentals_library"), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
      }

      setShowItemModal(false);
      await loadData();
    } catch (err: any) {
      alert("Failed to save rental item: " + err.message);
    } finally {
      setSubmittingItem(false);
    }
  };

  const handleDeleteItem = async (it: RentalItem) => {
    if (!window.confirm(`Delete rental item "${it.itemName}"?`)) return;
    try {
      await deleteDoc(doc(db, "vendor_rentals_library", it.id));
      setRentalItems((prev) => prev.filter((i) => i.id !== it.id));
    } catch (err: any) {
      alert("Failed to delete item: " + err.message);
    }
  };

  // Filtered lists
  const filteredVendors = useMemo(() => {
    return vendors.filter((v) =>
      v.name.toLowerCase().includes(vendorSearch.toLowerCase().trim()) ||
      (v.city && v.city.toLowerCase().includes(vendorSearch.toLowerCase().trim()))
    );
  }, [vendors, vendorSearch]);

  const selectedVendorItems = useMemo(() => {
    if (!selectedVendor) return [];
    return rentalItems
      .filter((i) => i.vendorId === selectedVendor.id || i.vendorName === selectedVendor.name)
      .filter((i) => !itemSearch.trim() || i.itemName.toLowerCase().includes(itemSearch.toLowerCase().trim()));
  }, [selectedVendor, rentalItems, itemSearch]);

  if (loading || loadingData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center font-mono text-sm uppercase tracking-wider text-gray-500 font-bold">
        Loading Vendor Rentals Library...
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
              <span className="bg-indigo-100 text-indigo-900 text-xs uppercase font-black px-2.5 py-0.5 rounded border border-indigo-300">
                Master Operations Catalog
              </span>
              <span className="text-xs text-gray-500 font-bold">
                {vendors.length} Vendors • {rentalItems.length} Total Rental Items
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mt-1">Vendor Rentals Master Library</h1>
            <p className="text-xs sm:text-sm font-semibold text-gray-600 mt-1">
              Add vendor profiles once, then manage all gear and services they supply (Trussing, Sound, Chairs, Generators).
            </p>
          </div>

          <button
            onClick={openNewVendorModal}
            className="bg-indigo-700 hover:bg-indigo-800 text-white font-black px-5 py-2.5 rounded-lg text-xs shadow transition flex items-center gap-1.5 self-start md:self-auto"
          >
            + Create New Vendor
          </button>
        </div>

        {/* Master 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column: Vendors List */}
          <div className="lg:col-span-4 space-y-3">
            <div className="bg-white p-4 rounded-2xl border-2 border-gray-300 shadow-sm space-y-3">
              <div className="flex justify-between items-center border-b pb-2">
                <h2 className="text-xs font-black uppercase text-gray-700 tracking-wider">
                  Suppliers & Vendors ({vendors.length})
                </h2>
                <button
                  onClick={openNewVendorModal}
                  className="text-xs text-indigo-700 hover:underline font-bold"
                >
                  + Add Vendor
                </button>
              </div>

              <input
                placeholder="Search vendor by name or city..."
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                className="w-full border-2 border-gray-300 p-2 rounded-lg text-xs font-bold bg-white text-gray-900 outline-none"
              />

              {filteredVendors.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-400 font-bold">
                  No suppliers found. Click "+ Create New Vendor" to add one.
                </div>
              ) : (
                <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                  {filteredVendors.map((v) => {
                    const isSelected = selectedVendor?.id === v.id;
                    const itemsCount = rentalItems.filter((i) => i.vendorId === v.id || i.vendorName === v.name).length;

                    return (
                      <div
                        key={v.id}
                        onClick={() => setSelectedVendor(v)}
                        className={`p-3.5 rounded-xl cursor-pointer transition border-2 text-xs ${
                          isSelected
                            ? "bg-indigo-900 text-white border-indigo-950 shadow-md"
                            : "bg-white text-gray-900 border-gray-200 hover:border-indigo-400 shadow-sm"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h3 className="font-black text-sm tracking-tight">{v.name}</h3>
                            <p className={`text-[11px] font-semibold mt-0.5 ${isSelected ? "text-indigo-200" : "text-gray-500"}`}>
                              📍 {v.city || "Location TBD"} {v.phone && `• Ph: ${v.phone}`}
                            </p>
                          </div>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-black border ${
                              isSelected
                                ? "bg-indigo-800 text-white border-indigo-700"
                                : "bg-gray-100 text-gray-800 border-gray-300"
                            }`}
                          >
                            {itemsCount} items
                          </span>
                        </div>

                        <div className="flex justify-end gap-3 mt-2.5 pt-2 border-t border-indigo-800/40 text-[10px] font-bold">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditVendorModal(v);
                            }}
                            className={`hover:underline ${isSelected ? "text-indigo-200" : "text-blue-600"}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteVendor(v);
                            }}
                            className={`hover:underline ${isSelected ? "text-red-300" : "text-red-600"}`}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Selected Vendor's Rental Item Catalog */}
          <div className="lg:col-span-8 space-y-4">
            {selectedVendor ? (
              <div className="bg-white p-6 rounded-2xl border-2 border-gray-300 shadow-sm space-y-4">
                {/* Vendor Overview Card */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-4">
                  <div>
                    <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      Selected Supplier Catalog
                    </span>
                    <h2 className="text-xl sm:text-2xl font-black text-gray-900 mt-1">
                      {selectedVendor.name}
                    </h2>
                    <p className="text-xs text-gray-500 font-semibold mt-0.5">
                      {selectedVendor.phone && `Phone: ${selectedVendor.phone} • `}
                      {selectedVendor.city && `Location: ${selectedVendor.city} • `}
                      {selectedVendor.notes || "No additional notes"}
                    </p>
                  </div>

                  <button
                    onClick={openNewItemModal}
                    className="bg-indigo-700 hover:bg-indigo-800 text-white font-black px-4 py-2 rounded-lg text-xs shadow transition flex items-center gap-1.5"
                  >
                    + Add Rental Item for this Vendor
                  </button>
                </div>

                {/* Items Search Bar */}
                <div className="flex items-center justify-between gap-4">
                  <input
                    placeholder={`Search within ${selectedVendor.name}'s inventory...`}
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    className="w-full sm:w-80 border-2 border-gray-300 p-2 rounded-lg text-xs font-bold bg-white text-gray-900 outline-none"
                  />
                  <span className="text-xs font-mono font-bold text-gray-500 whitespace-nowrap">
                    {selectedVendorItems.length} items cataloged
                  </span>
                </div>

                {/* Items Table */}
                <div className="border border-gray-300 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-indigo-50 text-[10px] font-black uppercase text-indigo-950 border-b border-indigo-200">
                      <tr>
                        <th className="p-3">Rental Item & Spec</th>
                        <th className="p-3">Size / Dimensions</th>
                        <th className="p-3 text-right">Rental Rate (₹)</th>
                        <th className="p-3 text-center">Multi-Day?</th>
                        <th className="p-3">Remarks / Sourcing Notes</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 font-medium">
                      {selectedVendorItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-gray-400 font-bold">
                            No rental items added for {selectedVendor.name} yet. Click "+ Add Rental Item for this Vendor" above.
                          </td>
                        </tr>
                      ) : (
                        selectedVendorItems.map((it) => {
                          const unitDisplay = it.pricingUnit === "Custom Unit" ? it.customUnit : it.pricingUnit;

                          return (
                            <tr key={it.id} className="hover:bg-indigo-50/40">
                              <td className="p-3">
                                <span className="font-bold text-gray-900 text-sm">🚚 {it.itemName}</span>
                              </td>
                              <td className="p-3 text-gray-600">
                                {it.size || "Standard"}
                              </td>
                              <td className="p-3 text-right font-black text-indigo-950 text-sm">
                                ₹{it.rate.toLocaleString()} <span className="text-[10px] font-normal text-gray-500">/ {unitDisplay}</span>
                              </td>
                              <td className="p-3 text-center">
                                {it.isDayApplicable ? (
                                  <span className="bg-purple-100 text-purple-900 text-[10px] font-bold px-2 py-0.5 rounded border border-purple-200">
                                    ✓ Multiplied per Day
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="p-3 text-gray-600 text-[11px] max-w-xs truncate">
                                {it.remarks || "—"}
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => openEditItemModal(it)}
                                    className="text-blue-600 hover:text-blue-800 font-bold px-2 py-1 rounded hover:bg-blue-50"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(it)}
                                    className="text-red-600 hover:text-red-800 font-bold px-2 py-1 rounded hover:bg-red-50"
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
            ) : (
              <div className="bg-white p-12 text-center rounded-2xl border-2 border-dashed border-gray-300 text-gray-400 font-bold">
                Select a vendor from the left column to view and manage their rental items.
              </div>
            )}
          </div>
        </div>

        {/* MODAL: CREATE / EDIT VENDOR */}
        {showVendorModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 border-2 border-indigo-500 shadow-2xl space-y-4 font-sans">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="text-base font-black text-indigo-950 uppercase">
                  {editingVendor ? "Edit Vendor Profile" : "Create New Rental Vendor"}
                </h3>
                <button onClick={() => setShowVendorModal(false)} className="text-gray-400 hover:text-black font-black">
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveVendor} className="space-y-3 text-xs">
                <div>
                  <label className="block font-black text-gray-800 mb-1 uppercase">Vendor / Firm Name *</label>
                  <input
                    required
                    placeholder="e.g. Modern Trussing Co., Sharma Lights"
                    value={vendorNameInput}
                    onChange={(e) => setVendorNameInput(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-gray-900 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-black text-gray-800 mb-1 uppercase">Contact Phone</label>
                    <input
                      placeholder="+91 98765 43210"
                      value={vendorPhoneInput}
                      onChange={(e) => setVendorPhoneInput(e.target.value)}
                      className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block font-black text-gray-800 mb-1 uppercase">City / Location</label>
                    <input
                      placeholder="e.g. Delhi NCR, Jaipur"
                      value={vendorCityInput}
                      onChange={(e) => setVendorCityInput(e.target.value)}
                      className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-gray-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-black text-gray-800 mb-1 uppercase">Supplier Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Payment terms, warehouse address, generator transport notes..."
                    value={vendorNotesInput}
                    onChange={(e) => setVendorNotesInput(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg bg-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowVendorModal(false)}
                    className="px-4 py-2 border font-bold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingVendor}
                    className="px-5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white font-black rounded-lg shadow disabled:opacity-50"
                  >
                    {submittingVendor ? "Saving..." : editingVendor ? "Update Vendor" : "Create Vendor"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: CREATE / EDIT RENTAL ITEM */}
        {showItemModal && selectedVendor && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 border-2 border-indigo-500 shadow-2xl space-y-4 font-sans">
              <div className="flex justify-between items-center border-b pb-2">
                <div>
                  <h3 className="text-base font-black text-indigo-950 uppercase">
                    {editingItem ? "Edit Rental Item" : "Add Rental Item"}
                  </h3>
                  <p className="text-[11px] text-gray-500 font-bold">
                    Supplier: {selectedVendor.name}
                  </p>
                </div>
                <button onClick={() => setShowItemModal(false)} className="text-gray-400 hover:text-black font-black">
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveItem} className="space-y-3 text-xs">
                <div>
                  <label className="block font-black text-gray-800 mb-1 uppercase">Rental Item Name *</label>
                  <input
                    required
                    placeholder="e.g. Heavy Duty Truss 20x10ft, Ghost Chair, 15kVA Generator"
                    value={itemNameInput}
                    onChange={(e) => setItemNameInput(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white text-gray-900 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-black text-gray-800 mb-1 uppercase">Size / Technical Specs</label>
                    <input
                      placeholder="e.g. 20x10 ft, 15kVA, 12-inch"
                      value={itemSizeInput}
                      onChange={(e) => setItemSizeInput(e.target.value)}
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
                      value={itemRateInput}
                      onChange={(e) => setItemRateInput(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold text-right bg-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-black text-gray-800 mb-1 uppercase">Pricing Unit *</label>
                    <select
                      value={itemUnitInput}
                      onChange={(e) => setItemUnitInput(e.target.value)}
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
                        checked={itemIsDayApplicable}
                        onChange={(e) => setItemIsDayApplicable(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <span>Multiplied per Day?</span>
                    </label>
                  </div>
                </div>

                {itemUnitInput === "Custom Unit" && (
                  <div>
                    <label className="block font-black text-indigo-950 mb-1 uppercase">Specify Custom Unit *</label>
                    <input
                      required
                      placeholder="e.g. Per Section, Per Box, Per 50 Pcs"
                      value={itemCustomUnitInput}
                      onChange={(e) => setItemCustomUnitInput(e.target.value)}
                      className="w-full border-2 border-indigo-400 p-2 rounded-lg font-bold bg-white"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-black text-gray-800 mb-1 uppercase">Item Remarks / Vendor Specs</label>
                  <input
                    placeholder="e.g. Requires 3-phase connection, Setup time 2 hrs"
                    value={itemRemarksInput}
                    onChange={(e) => setItemRemarksInput(e.target.value)}
                    className="w-full border-2 border-gray-300 p-2 rounded-lg bg-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowItemModal(false)}
                    className="px-4 py-2 border font-bold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingItem}
                    className="px-5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white font-black rounded-lg shadow disabled:opacity-50"
                  >
                    {submittingItem ? "Saving..." : editingItem ? "Update Item" : "Save Rental Item"}
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