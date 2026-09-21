"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { useAuth } from "../../../../context/AuthContext";

interface DayShiftOverride {
  dayName: string;
  isActive: boolean;
  shifts: number;
}

interface WeddingLaborItem {
  masterId: string;
  name: string;
  category: string;
  headcount: number;
  ratePerShift: number;
  daysCount: number;
  mealsPerDay: number;
  costPerMeal: number;
  travelCostPerPerson: number;
  dayShifts: DayShiftOverride[];
}

export default function WeddingLaborPlannerPage() {
  const params = useParams();
  const router = useRouter();
  const handoverId = params.id as string;
  const { user, loading } = useAuth();

  const [handover, setHandover] = useState<any>(null);
  const [laborMasterList, setLaborMasterList] = useState<any[]>([]);

  // Wedding-level overrides
  const [weddingLaborList, setWeddingLaborList] = useState<WeddingLaborItem[]>([]);
  const [globalCostPerMeal, setGlobalCostPerMeal] = useState<number>(150);
  const [globalTravelCost, setGlobalTravelCost] = useState<number>(800);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    const loadAllData = async () => {
      if (!handoverId) return;
      try {
        // 1. Fetch Handover
        const hSnap = await getDoc(doc(db, "handovers", handoverId));
        if (hSnap.exists()) {
          const hData = hSnap.data();
          setHandover(hData);

          // 2. Fetch Labor Master Catalog
          const lSnap = await getDocs(collection(db, "labor_master"));
          const masterItems = lSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setLaborMasterList(masterItems);

          // If labor plan already saved in handover, load it; otherwise initialize from master
          if (hData.laborPlanning && hData.laborPlanning.items?.length > 0) {
            setWeddingLaborList(hData.laborPlanning.items);
            if (hData.laborPlanning.globalCostPerMeal) setGlobalCostPerMeal(hData.laborPlanning.globalCostPerMeal);
            if (hData.laborPlanning.globalTravelCost) setGlobalTravelCost(hData.laborPlanning.globalTravelCost);
          } else {
            // Build default days list for shifts
            const weddingDays = hData.days?.length > 0 
              ? hData.days.map((d: any) => d.dayName) 
              : ["Setup Day (Day 0)", "Wedding Day 1", "Wedding Day 2", "Breakdown Day"];

            const initialItems: WeddingLaborItem[] = masterItems.map((m: any) => ({
              masterId: m.id,
              name: m.name,
              category: m.tradeCategory || "Operations",
              headcount: 0,
              ratePerShift: Number(m.ratePerShift) || 500,
              daysCount: weddingDays.length,
              mealsPerDay: Number(m.mealsPerDay) || 3,
              costPerMeal: Number(m.defaultCostPerMeal) || 150,
              travelCostPerPerson: Number(m.defaultTravelCost) || 800,
              dayShifts: weddingDays.map((dName: string) => ({
                dayName: dName,
                isActive: true,
                shifts: Number(m.defaultShiftsPerDay) || 2,
              })),
            }));
            setWeddingLaborList(initialItems);
          }
        }
      } catch (err) {
        console.error("Error loading labor planner data:", err);
      }
    };
    loadAllData();
  }, [handoverId]);

  // Apply Global Meal Cost to all labor items
  const handleApplyGlobalMealCost = (newMealRate: number) => {
    setGlobalCostPerMeal(newMealRate);
    setWeddingLaborList((prev) =>
      prev.map((item) => ({ ...item, costPerMeal: newMealRate }))
    );
  };

  // Apply Global Travel Cost to all labor items
  const handleApplyGlobalTravelCost = (newTravelRate: number) => {
    setGlobalTravelCost(newTravelRate);
    setWeddingLaborList((prev) =>
      prev.map((item) => ({ ...item, travelCostPerPerson: newTravelRate }))
    );
  };

  // Update Headcount for a labor trade
  const updateHeadcount = (idx: number, count: number) => {
    const updated = [...weddingLaborList];
    updated[idx].headcount = Math.max(0, count);
    setWeddingLaborList(updated);
  };

  // Update Days Count for a labor trade
  const updateDaysCount = (idx: number, days: number) => {
    const updated = [...weddingLaborList];
    updated[idx].daysCount = Math.max(1, days);
    setWeddingLaborList(updated);
  };

  // Update Shift on a specific Day for a trade
  const updateSpecificDayShift = (itemIdx: number, dayIdx: number, newShifts: number) => {
    const updated = [...weddingLaborList];
    updated[itemIdx].dayShifts[dayIdx].shifts = Math.max(0, newShifts);
    setWeddingLaborList(updated);
  };

  // Toggle Day Active/Inactive for a trade
  const toggleDayActive = (itemIdx: number, dayIdx: number) => {
    const updated = [...weddingLaborList];
    updated[itemIdx].dayShifts[dayIdx].isActive = !updated[itemIdx].dayShifts[dayIdx].isActive;
    setWeddingLaborList(updated);
  };

  // Save to Firebase Handover
  const handleSaveLaborPlan = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "handovers", handoverId), {
        laborPlanning: {
          globalCostPerMeal,
          globalTravelCost,
          items: weddingLaborList,
          updatedAt: new Date().toISOString(),
        },
      });
      alert("✅ Labor and operations budget saved successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save labor plan.");
    } finally {
      setSaving(false);
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  if (loading || !handover) {
    return <div className="p-12 text-center text-xl font-bold">Loading Labor Planner...</div>;
  }

  // =========================================================================
  // FINANCIAL CALCULATIONS & BUDGET SUMMARY
  // =========================================================================
  let grandTotalHeadcount = 0;
  let grandTotalShiftsCost = 0;
  let grandTotalFoodCost = 0;
  let grandTotalTravelCost = 0;

  weddingLaborList.forEach((item) => {
    if (item.headcount > 0) {
      grandTotalHeadcount += item.headcount;

      // Calculate total shifts for this trade
      const activeDays = item.dayShifts.filter((d) => d.isActive);
      const shiftsPerPerson = activeDays.reduce((sum, d) => sum + Number(d.shifts), 0);
      const totalShifts = item.headcount * shiftsPerPerson;
      grandTotalShiftsCost += totalShifts * item.ratePerShift;

      // Food Cost: 3 meals * active days * headcount * costPerMeal
      const totalMeals = item.headcount * activeDays.length * (item.mealsPerDay || 3);
      grandTotalFoodCost += totalMeals * (item.costPerMeal || globalCostPerMeal);

      // Travel Cost: 1 round trip per person
      grandTotalTravelCost += item.headcount * (item.travelCostPerPerson || globalTravelCost);
    }
  });

  const grandTotalOperationsBudget = grandTotalShiftsCost + grandTotalFoodCost + grandTotalTravelCost;

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 print:bg-white print:p-0">
      {/* FLOATING ACTION BAR (HIDDEN IN PDF PRINT) */}
      <header className="sticky top-0 z-40 bg-gray-900 text-white px-6 py-3.5 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/handovers/${handoverId}`)}
            className="text-xs font-bold bg-gray-800 hover:bg-gray-700 px-3.5 py-2 rounded-lg transition flex items-center gap-1.5"
          >
            ← Back to Handover Workspace
          </button>
          <span className="text-xs text-gray-300 hidden md:inline">
            Manpower Planner: <strong>{handover.title}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveLaborPlan}
            disabled={saving}
            className="bg-green-700 hover:bg-green-800 text-white font-black px-5 py-2 rounded-lg text-xs shadow transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "💾 Save Labor Plan"}
          </button>

          <button
            onClick={handlePrintPdf}
            className="bg-amber-600 hover:bg-amber-700 text-white font-black px-5 py-2 rounded-lg text-xs shadow transition flex items-center gap-1.5"
          >
            🖨️ Download / Save as PDF
          </button>
        </div>
      </header>

      {/* DOCUMENT WRAPPER */}
      <main className="max-w-5xl mx-auto p-4 sm:p-8 space-y-8 print:max-w-full print:p-2 print:space-y-6">

        {/* 1. DOCUMENT HEADER & WEDDING OVERVIEW */}
        <section className="bg-white border-2 border-gray-300 rounded-2xl p-6 sm:p-8 shadow-sm print:border print:rounded-none print:p-6 print:shadow-none">
          <div className="flex justify-between items-start border-b-2 border-amber-600 pb-4">
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-amber-950 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                Backend Operations & Manpower Costing Sheet
              </span>
              <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mt-2 leading-tight">
                {handover.title} - Labor Deployment
              </h1>
              <p className="text-sm font-bold text-gray-600 mt-1">
                📍 Venue: {handover.resortName || "Destination Venue"} | 📅 Dates: {handover.startDate} to {handover.endDate}
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-black uppercase text-gray-500 block">Total Operations Budget:</span>
              <span className="text-3xl font-black text-amber-700 font-mono">
                ₹{grandTotalOperationsBudget.toLocaleString()}
              </span>
              <p className="text-[11px] font-mono text-gray-400 mt-0.5">
                Total Manpower: <strong>{grandTotalHeadcount} Workers</strong>
              </p>
            </div>
          </div>

          {/* Budget Breakdown Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 text-xs">
            <div className="bg-slate-50 border p-3 rounded-xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Total Shift Wages</span>
              <strong className="text-gray-900 text-sm font-mono">₹{grandTotalShiftsCost.toLocaleString()}</strong>
            </div>

            <div className="bg-slate-50 border p-3 rounded-xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Total Food & Meals</span>
              <strong className="text-blue-800 text-sm font-mono">₹{grandTotalFoodCost.toLocaleString()}</strong>
            </div>

            <div className="bg-slate-50 border p-3 rounded-xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Total Travel Allowance</span>
              <strong className="text-purple-800 text-sm font-mono">₹{grandTotalTravelCost.toLocaleString()}</strong>
            </div>

            <div className="bg-slate-50 border p-3 rounded-xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Total Deployed Force</span>
              <strong className="text-amber-900 text-sm font-black">{grandTotalHeadcount} Labors</strong>
            </div>
          </div>
        </section>

        {/* 2. GLOBAL RATE MODIFIERS (HIDDEN IN PRINT) */}
        <section className="bg-amber-50/70 border-2 border-amber-300 rounded-2xl p-5 shadow-sm space-y-3 print:hidden">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-amber-950 uppercase tracking-wide">
                ⚙️ Global Wedding Cost Modifiers
              </h3>
              <p className="text-xs text-amber-800 font-medium">
                Changing these rates automatically updates the entire food and travel budget for all trades.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="bg-white p-3 rounded-xl border border-amber-300 flex items-center justify-between">
              <div>
                <label className="block text-xs font-black text-gray-800">Cost Per Meal (₹):</label>
                <span className="text-[11px] text-gray-500 font-medium">Applies to 3 meals/day/person</span>
              </div>
              <input
                type="number"
                value={globalCostPerMeal}
                onChange={(e) => handleApplyGlobalMealCost(Number(e.target.value))}
                className="w-28 border-2 border-gray-400 p-1.5 rounded-lg text-sm font-bold text-center bg-gray-50"
              />
            </div>

            <div className="bg-white p-3 rounded-xl border border-amber-300 flex items-center justify-between">
              <div>
                <label className="block text-xs font-black text-gray-800">Round-Trip Travel / Person (₹):</label>
                <span className="text-[11px] text-gray-500 font-medium">Venue arrival + return allowance</span>
              </div>
              <input
                type="number"
                value={globalTravelCost}
                onChange={(e) => handleApplyGlobalTravelCost(Number(e.target.value))}
                className="w-28 border-2 border-gray-400 p-1.5 rounded-lg text-sm font-bold text-center bg-gray-50"
              />
            </div>
          </div>
        </section>

        {/* 3. DETAILED LABOR TRADE DEPLOYMENT & CALCULATION CARDS */}
        <section className="space-y-6">
          <div className="border-b-2 border-gray-900 pb-2 flex justify-between items-center">
            <h2 className="text-xl font-black text-gray-900 uppercase tracking-wide">
              👷 Trade-Wise Manpower Allocation & Shift Schedule
            </h2>
            <span className="text-xs font-bold text-gray-500">
              {weddingLaborList.filter((i) => i.headcount > 0).length} Active Trades Assigned
            </span>
          </div>

          <div className="space-y-6">
            {weddingLaborList.map((item, idx) => {
              const activeDays = item.dayShifts.filter((d) => d.isActive);
              const shiftsPerPerson = activeDays.reduce((sum, d) => sum + Number(d.shifts), 0);
              const totalShifts = item.headcount * shiftsPerPerson;
              const lineShiftCost = totalShifts * item.ratePerShift;
              const totalMeals = item.headcount * activeDays.length * (item.mealsPerDay || 3);
              const lineFoodCost = totalMeals * item.costPerMeal;
              const lineTravelCost = item.headcount * item.travelCostPerPerson;
              const lineTotalCost = lineShiftCost + lineFoodCost + lineTravelCost;

              return (
                <div
                  key={idx}
                  className={`bg-white border-2 rounded-2xl p-5 shadow-sm space-y-4 print:border print:rounded-none print:shadow-none print-avoid-break ${
                    item.headcount > 0 ? "border-gray-400" : "border-gray-200 opacity-60"
                  }`}
                >
                  {/* Top: Trade Title & Overall Line Cost */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-3 gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded">
                          {item.category}
                        </span>
                        <span className="text-xs font-mono font-bold text-gray-500">
                          Rate: ₹{item.ratePerShift}/shift
                        </span>
                      </div>
                      <h4 className="text-xl font-black text-gray-900 mt-0.5">
                        👷 {item.name}
                      </h4>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="text-[10px] font-bold text-gray-500 block uppercase">Estimated Trade Budget:</span>
                      <span className="text-2xl font-black text-amber-800 font-mono">
                        ₹{lineTotalCost.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Inputs: Headcount & Parameters */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl text-xs">
                    <div>
                      <label className="block font-black text-gray-800 mb-1">Assigned Headcount *</label>
                      <input
                        type="number"
                        min="0"
                        value={item.headcount || ""}
                        onChange={(e) => updateHeadcount(idx, Number(e.target.value))}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-black text-sm text-center bg-white text-gray-900"
                        placeholder="0"
                      />
                    </div>

                    <div>
                      <label className="block font-black text-gray-800 mb-1">Active Days Needed</label>
                      <input
                        type="number"
                        min="1"
                        value={item.daysCount || activeDays.length}
                        onChange={(e) => updateDaysCount(idx, Number(e.target.value))}
                        className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-sm text-center bg-white text-gray-900"
                      />
                    </div>

                    <div>
                      <label className="block font-black text-gray-800 mb-1">Meal Cost / Person (₹)</label>
                      <input
                        type="number"
                        value={item.costPerMeal}
                        onChange={(e) => {
                          const updated = [...weddingLaborList];
                          updated[idx].costPerMeal = Number(e.target.value);
                          setWeddingLaborList(updated);
                        }}
                        className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold text-xs text-center bg-white text-gray-900"
                      />
                    </div>

                    <div>
                      <label className="block font-black text-gray-800 mb-1">Round-Trip Travel / Person (₹)</label>
                      <input
                        type="number"
                        value={item.travelCostPerPerson}
                        onChange={(e) => {
                          const updated = [...weddingLaborList];
                          updated[idx].travelCostPerPerson = Number(e.target.value);
                          setWeddingLaborList(updated);
                        }}
                        className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold text-xs text-center bg-white text-gray-900"
                      />
                    </div>
                  </div>

                  {/* Day-by-Day Shift Customization Grid */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-black uppercase text-gray-700 block">
                      🗓️ Day-Wise Shift Allocation (Click to change shifts on specific days):
                    </span>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {item.dayShifts.map((dayShift, dIdx) => (
                        <div
                          key={dIdx}
                          className={`p-2.5 rounded-xl border-2 transition text-xs space-y-1 ${
                            dayShift.isActive ? "bg-white border-amber-400" : "bg-gray-100 border-gray-300 opacity-60"
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-900 truncate">{dayShift.dayName}</span>
                            <button
                              type="button"
                              onClick={() => toggleDayActive(idx, dIdx)}
                              className={`text-[10px] font-black px-1.5 py-0.2 rounded ${
                                dayShift.isActive ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"
                              }`}
                            >
                              {dayShift.isActive ? "Active" : "Off"}
                            </button>
                          </div>

                          {dayShift.isActive && (
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[10px] font-semibold text-gray-500">Shifts:</span>
                              <select
                                value={dayShift.shifts}
                                onChange={(e) => updateSpecificDayShift(idx, dIdx, Number(e.target.value))}
                                className="border border-gray-400 p-0.5 rounded font-black text-xs bg-white text-gray-900"
                              >
                                <option value={1}>1 Shift (8h)</option>
                                <option value={2}>2 Shifts (Standard)</option>
                                <option value={3}>3 Shifts (Heavy)</option>
                                <option value={4}>4 Shifts (24h)</option>
                              </select>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Financial Breakdown Summary Table */}
                  <div className="bg-gray-50 border border-gray-200 p-3 rounded-xl grid grid-cols-3 gap-2 text-center text-xs font-semibold">
                    <div>
                      <span className="text-[10px] text-gray-500 block uppercase">Shifts Total</span>
                      <p className="font-mono text-gray-900 font-bold">
                        {totalShifts} Shifts = ₹{lineShiftCost.toLocaleString()}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] text-gray-500 block uppercase">Food Total</span>
                      <p className="font-mono text-blue-900 font-bold">
                        {totalMeals} Meals = ₹{lineFoodCost.toLocaleString()}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] text-gray-500 block uppercase">Travel Total</span>
                      <p className="font-mono text-purple-900 font-bold">
                        {item.headcount} Labors = ₹{lineTravelCost.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4. SIGN-OFF FOOTER */}
        <section className="bg-white border-2 border-gray-300 rounded-2xl p-6 sm:p-8 space-y-6 print:border print:rounded-none print:break-before-page">
          <h3 className="font-black text-sm uppercase text-gray-900 border-b pb-2">
            Operations Head & Labor Contractor Sign-Off
          </h3>

          <div className="grid grid-cols-2 gap-8 pt-6">
            <div className="border-t-2 border-gray-400 pt-2 text-center">
              <p className="font-bold text-sm text-gray-900">Production & Operations Head</p>
              <p className="text-xs text-gray-500 font-semibold">DecorOps Operations Approval</p>
            </div>

            <div className="border-t-2 border-gray-400 pt-2 text-center">
              <p className="font-bold text-sm text-gray-900">Main Labor Contractor / Thekedar</p>
              <p className="text-xs text-gray-500 font-semibold">Manpower Agreement & Acceptance</p>
            </div>
          </div>
        </section>
      </main>

      {/* PRINT-OPTIMIZED STYLES */}
      <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          header, nav, button {
            display: none !important;
          }
          .print\\:break-before-page {
            page-break-before: always !important;
            break-before: page !important;
          }
          .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
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