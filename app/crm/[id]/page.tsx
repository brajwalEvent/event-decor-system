"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { db } from "../../../lib/firebase";
import { 
  doc, 
  getDoc, 
  setDoc,
  updateDoc, 
  collection, 
  getDocs 
} from "firebase/firestore";
import { useAuth } from "../../../context/AuthContext";

interface ActivityLog {
  id: string;
  type: "Call" | "WhatsApp" | "Google Meet" | "Site Visit" | "Internal Note" | "Stage Change";
  clientFeedback: string;
  nextAction: string;
  author: string;
  timestamp: string;
}

interface QuoteItem {
  id: string;
  itemId: string;
  name: string;
  category: string;
  variantName: string;
  quantity: number;
  days: number | null;
  isDayApplicable: boolean;
  unit: string;
  unitPrice: number;
  discount: number;
  netAmount: number;
  notes: string;
  riders?: {
    travelCostAdditional?: boolean;
    foodCostAdditional?: boolean;
    roomsRequired?: boolean;
    customAttributes?: string[];
  };
}

interface QuoteEventSection {
  id: string;
  eventName: string;
  items: QuoteItem[];
}

interface PaymentMilestone {
  id: string;
  percentage: number;
  dueDate: string;
  description: string;
}

interface ReceivedPayment {
  id: string;
  date: string;
  amount: number;
  mode: string;
  reference: string;
}

export default function LeadQuotationWorkspace() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;
  const { user, role, isSuperAdmin, loading } = useAuth();

  const [lead, setLead] = useState<any>(null);
  const [otherItemsLibrary, setOtherItemsLibrary] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // PIPELINE STAGES (INDUSTRY STANDARD)
  const pipelineStages = [
    { name: "New Inquiry", probability: 10, color: "bg-blue-600" },
    { name: "Discovery Call", probability: 25, color: "bg-indigo-600" },
    { name: "Quote Sent", probability: 50, color: "bg-purple-600" },
    { name: "Site Visit / Meeting", probability: 75, color: "bg-amber-600" },
    { name: "Negotiation", probability: 90, color: "bg-orange-600" },
    { name: "Deal Closed / Booked", probability: 100, color: "bg-emerald-600" },
    { name: "Lost", probability: 0, color: "bg-red-600" }
  ];

  const [currentStage, setCurrentStage] = useState("New Inquiry");

  // FOLLOW-UP & MEETING SCHEDULE STATES
  const [nextFollowupDate, setNextFollowupDate] = useState("");
  const [nextFollowupTime, setNextFollowupTime] = useState("");
  const [nextMeetingType, setNextMeetingType] = useState<"Phone Call" | "WhatsApp" | "Google Meet" | "Site Visit">("Phone Call");
  const [googleMeetLink, setGoogleMeetLink] = useState("");
  const [isFollowupDone, setIsFollowupDone] = useState(false);

  // ACTIVITY & CLIENT COMMUNICATION FEED
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityType, setActivityType] = useState<"Call" | "WhatsApp" | "Google Meet" | "Site Visit" | "Internal Note">("Call");
  const [clientSaysInput, setClientSaysInput] = useState("");
  const [nextActionInput, setNextActionInput] = useState("");

  // Deal Closure & Payments Ledger
  const [closedDealAmount, setClosedDealAmount] = useState<number>(0);
  const [advanceBookingAmount, setAdvanceBookingAmount] = useState<number>(0);
  const [receivedPayments, setReceivedPayments] = useState<ReceivedPayment[]>([]);

  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payDate, setPayDate] = useState("");
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMode, setPayMode] = useState("Bank Transfer / NEFT");
  const [payRef, setPayRef] = useState("");

  // Quotation Setup
  const [validityDate, setValidityDate] = useState("");
  const [decorCost, setDecorCost] = useState<number>(0);
  const [weddingWideItems, setWeddingWideItems] = useState<QuoteItem[]>([]);
  const [quoteEvents, setQuoteEvents] = useState<QuoteEventSection[]>([]);
  const standardEvents = ["Haldi", "Mehendi", "Sangeet", "Baraat & Wedding", "Reception", "Cocktail", "Pool Party", "After Party"];
  const [availableEventTypes, setAvailableEventTypes] = useState<string[]>(standardEvents);
  const [selectedEventToAdd, setSelectedEventToAdd] = useState("Haldi");
  const [isCustomEventModal, setIsCustomEventModal] = useState(false);
  const [customEventInput, setCustomEventInput] = useState("");

  // Item Add Form State for Wedding-Wide Items
  const [wwItemId, setWwItemId] = useState("");
  const [wwVariantId, setWwVariantId] = useState("");
  const [wwQty, setWwQty] = useState<number>(1);
  const [wwIsDayApplicable, setWwIsDayApplicable] = useState<boolean>(false);
  const [wwDays, setWwDays] = useState<number>(1);
  const [wwDiscount, setWwDiscount] = useState<number>(0);
  const [wwNotes, setWwNotes] = useState("");

  // Item Add Form State for Events
  const [activeEventIndexForAdd, setActiveEventIndexForAdd] = useState<number | null>(null);
  const [evItemId, setEvItemId] = useState("");
  const [evVariantId, setEvVariantId] = useState("");
  const [evQty, setEvQty] = useState<number>(1);
  const [evIsDayApplicable, setEvIsDayApplicable] = useState<boolean>(false);
  const [evDays, setEvDays] = useState<number>(1);
  const [evDiscount, setEvDiscount] = useState<number>(0);
  const [evNotes, setEvNotes] = useState("");

  // Payment Milestones & Terms
  const [paymentMilestones, setPaymentMilestones] = useState<PaymentMilestone[]>([]);
  const [customQuoteNotes, setCustomQuoteNotes] = useState("");
  const [milestonePercent, setMilestonePercent] = useState<number>(25);
  const [milestoneDate, setMilestoneDate] = useState("");
  const [milestoneDesc, setMilestoneDesc] = useState("Advance on Booking Confirmation");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    const loadAll = async () => {
      if (!leadId) return;
      try {
        const lSnap = await getDoc(doc(db, "leads", leadId));
        if (lSnap.exists()) {
          const data = lSnap.data();
          setLead(data);
          setCurrentStage(data.status || "New Inquiry");
          setClosedDealAmount(Number(data.closedDealAmount) || 0);
          setAdvanceBookingAmount(Number(data.advanceBookingAmount) || 0);
          setReceivedPayments(data.receivedPayments || []);

          // Follow-up details
          if (data.followup) {
            setNextFollowupDate(data.followup.date || "");
            setNextFollowupTime(data.followup.time || "");
            setNextMeetingType(data.followup.type || "Phone Call");
            setGoogleMeetLink(data.followup.googleMeetLink || "");
            setIsFollowupDone(Boolean(data.followup.isDone));
          }

          // Activity Logs
          setActivityLogs(data.activityLogs || []);

          // Quotation Data
          if (data.quotation) {
            setValidityDate(data.quotation.validityDate || "");
            setDecorCost(Number(data.quotation.decorCost) || 0);
            setWeddingWideItems(data.quotation.weddingWideItems || []);
            setQuoteEvents(data.quotation.events || []);
            setPaymentMilestones(data.quotation.paymentMilestones || []);
            setCustomQuoteNotes(data.quotation.customNotes || "");
          } else {
            setPaymentMilestones([
              { id: "1", percentage: 25, dueDate: "", description: "Advance on Booking Confirmation" },
              { id: "2", percentage: 50, dueDate: "", description: "15 Days Prior to Setup" },
              { id: "3", percentage: 25, dueDate: "", description: "On-Site Setup Day Handover" },
            ]);
          }
        }

        const entSnap = await getDocs(collection(db, "entertainment"));
        setOtherItemsLibrary(entSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        const evCatSnap = await getDoc(doc(db, "metadata", "events_catalog"));
        if (evCatSnap.exists() && evCatSnap.data().customEvents) {
          const savedCustom = evCatSnap.data().customEvents;
          setAvailableEventTypes(Array.from(new Set([...standardEvents, ...savedCustom])));
        }
      } catch (err) {
        console.error("Error loading lead workspace:", err);
      }
    };
    loadAll();
  }, [leadId]);

  // LOG NEW ACTIVITY / TOUCHPOINT
  const handleLogActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientSaysInput.trim()) return;

    const newLog: ActivityLog = {
      id: Date.now().toString(),
      type: activityType,
      clientFeedback: clientSaysInput.trim(),
      nextAction: nextActionInput.trim(),
      author: user?.displayName || user?.email || "Sales Rep",
      timestamp: new Date().toISOString(),
    };

    const updated = [newLog, ...activityLogs];
    setActivityLogs(updated);

    try {
      await updateDoc(doc(db, "leads", leadId), {
        activityLogs: updated,
        updatedAt: new Date().toISOString(),
      });
      setClientSaysInput("");
      setNextActionInput("");
    } catch (err) {
      console.error(err);
      alert("Failed to log activity.");
    }
  };

  // CHANGE STAGE (INFOGRAPHIC STEPPER)
  const handleStageChange = async (newStageName: string) => {
    if (newStageName === currentStage) return;

    const confirmMsg = `Advance pipeline stage to "${newStageName}"?`;
    if (!window.confirm(confirmMsg)) return;

    const oldStage = currentStage;
    setCurrentStage(newStageName);

    // Auto-create audit log for stage change
    const stageLog: ActivityLog = {
      id: Date.now().toString(),
      type: "Stage Change",
      clientFeedback: `Moved pipeline stage from "${oldStage}" to "${newStageName}".`,
      nextAction: newStageName === "Quote Sent" ? "Follow up on quotation feedback" : "Execute stage deliverables",
      author: user?.displayName || user?.email || "Sales Rep",
      timestamp: new Date().toISOString(),
    };

    const updatedLogs = [stageLog, ...activityLogs];
    setActivityLogs(updatedLogs);

    try {
      await updateDoc(doc(db, "leads", leadId), {
        status: newStageName,
        activityLogs: updatedLogs,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
    }
  };

  // COMPLETE FOLLOW-UP
  const handleMarkFollowupComplete = async () => {
    const feedback = prompt("What did the client say on this follow-up call / meeting?:");
    if (feedback === null) return;

    setIsFollowupDone(true);

    const completionLog: ActivityLog = {
      id: Date.now().toString(),
      type: nextMeetingType as any,
      clientFeedback: feedback.trim() || "Follow-up completed successfully.",
      nextAction: "Schedule next touchpoint",
      author: user?.displayName || user?.email || "Sales Rep",
      timestamp: new Date().toISOString(),
    };

    const updatedLogs = [completionLog, ...activityLogs];
    setActivityLogs(updatedLogs);

    await updateDoc(doc(db, "leads", leadId), {
      "followup.isDone": true,
      activityLogs: updatedLogs,
      updatedAt: new Date().toISOString(),
    });
  };

  // Helper check for overdue follow-up
  const isFollowupOverdue = () => {
    if (!nextFollowupDate || isFollowupDone) return false;
    const now = new Date();
    const scheduled = new Date(`${nextFollowupDate}T${nextFollowupTime || "23:59"}`);
    return now > scheduled;
  };

  const checkIsDayUnit = (unitStr: string) => unitStr?.toLowerCase().includes("day") || false;

  const handleSavePermanentCustomEvent = async () => {
    const trimmed = customEventInput.trim();
    if (!trimmed) return;

    const updated = Array.from(new Set([...availableEventTypes, trimmed]));
    setAvailableEventTypes(updated);

    try {
      await setDoc(doc(db, "metadata", "events_catalog"), {
        customEvents: updated.filter((ev) => !standardEvents.includes(ev)),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      console.error(e);
    }

    setSelectedEventToAdd(trimmed);
    setIsCustomEventModal(false);
    setCustomEventInput("");
  };

  const handleAddEventSection = () => {
    if (!selectedEventToAdd) return;
    setQuoteEvents([
      ...quoteEvents,
      { id: Date.now().toString(), eventName: selectedEventToAdd, items: [] }
    ]);
  };

  const handleRemoveEventSection = (id: string, evName: string) => {
    if (!window.confirm(`Remove "${evName}"?`)) return;
    setQuoteEvents(quoteEvents.filter((e) => e.id !== id));
  };

  const createQuoteItemObject = (
    masterItem: any, 
    variantId: string, 
    qty: number, 
    isDayActive: boolean,
    daysCount: number, 
    discountAmt: number, 
    notesText: string
  ): QuoteItem => {
    let variantName = "";
    let unitPrice = masterItem.price || 0;
    let unit = masterItem.pricingUnit === "Custom Unit" ? masterItem.customUnit : (masterItem.pricingUnit || "Pcs");

    if (variantId) {
      const v = masterItem.variants?.find((item: any) => item.id === variantId);
      if (v) {
        variantName = v.name;
        unitPrice = v.price;
        unit = v.pricingUnit === "Custom Unit" ? v.customUnit : v.pricingUnit;
      }
    }

    const q = Math.max(1, Number(qty) || 1);
    const d = isDayActive ? Math.max(1, Number(daysCount) || 1) : 1;
    const disc = Math.max(0, Number(discountAmt) || 0);
    const net = Math.max(0, (unitPrice * q * (isDayActive ? d : 1)) - disc);

    const riders = {
      travelCostAdditional: Boolean(masterItem.attributes?.travelCostAdditional),
      foodCostAdditional: Boolean(masterItem.attributes?.foodCostAdditional),
      roomsRequired: Boolean(masterItem.attributes?.roomsRequired),
      customAttributes: masterItem.attributes?.customAttributes || [],
    };

    return {
      id: Date.now().toString(),
      itemId: masterItem.id,
      name: masterItem.name,
      category: masterItem.category,
      variantName,
      quantity: q,
      days: isDayActive ? d : null,
      isDayApplicable: isDayActive,
      unit,
      unitPrice,
      discount: disc,
      netAmount: net,
      notes: notesText.trim(),
      riders,
    };
  };

  const handleAddWeddingWideItem = () => {
    const master = otherItemsLibrary.find((i) => i.id === wwItemId);
    if (!master) return alert("Select an item.");

    const newItem = createQuoteItemObject(master, wwVariantId, wwQty, wwIsDayApplicable, wwDays, wwDiscount, wwNotes);
    setWeddingWideItems([...weddingWideItems, newItem]);

    setWwItemId("");
    setWwVariantId("");
    setWwQty(1);
    setWwDays(1);
    setWwIsDayApplicable(false);
    setWwDiscount(0);
    setWwNotes("");
  };

  const handleAddEventItem = (eventIdx: number) => {
    const master = otherItemsLibrary.find((i) => i.id === evItemId);
    if (!master) return alert("Select an item.");

    const newItem = createQuoteItemObject(master, evVariantId, evQty, evIsDayApplicable, evDays, evDiscount, evNotes);
    const updated = [...quoteEvents];
    updated[eventIdx].items.push(newItem);
    setQuoteEvents(updated);

    setActiveEventIndexForAdd(null);
    setEvItemId("");
    setEvVariantId("");
    setEvQty(1);
    setEvDays(1);
    setEvIsDayApplicable(false);
    setEvDiscount(0);
    setEvNotes("");
  };

  const handleRemoveEventItem = (eventIdx: number, itemId: string) => {
    const updated = [...quoteEvents];
    updated[eventIdx].items = updated[eventIdx].items.filter((i) => i.id !== itemId);
    setQuoteEvents(updated);
  };

  const handleAddMilestone = () => {
    if (!milestonePercent || milestonePercent <= 0) return;
    setPaymentMilestones([
      ...paymentMilestones,
      {
        id: Date.now().toString(),
        percentage: Number(milestonePercent),
        dueDate: milestoneDate,
        description: milestoneDesc.trim(),
      },
    ]);
    setMilestonePercent(25);
    setMilestoneDate("");
    setMilestoneDesc("");
  };

  const handleAddReceivedPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payAmount || payAmount <= 0) return;

    setReceivedPayments([
      ...receivedPayments,
      {
        id: Date.now().toString(),
        date: payDate || new Date().toISOString().split("T")[0],
        amount: Number(payAmount),
        mode: payMode,
        reference: payRef.trim(),
      },
    ]);
    setShowPaymentModal(false);
    setPayAmount(0);
    setPayDate("");
    setPayRef("");
  };

  // Financial Calculations
  const grossWeddingWide = weddingWideItems.reduce((sum, i) => sum + (i.unitPrice * i.quantity * (i.isDayApplicable ? (i.days || 1) : 1)), 0);
  const discountWeddingWide = weddingWideItems.reduce((sum, i) => sum + i.discount, 0);
  const netWeddingWide = weddingWideItems.reduce((sum, i) => sum + i.netAmount, 0);

  let grossEventsTotal = 0;
  let discountEventsTotal = 0;
  let netEventsTotal = 0;

  quoteEvents.forEach((ev) => {
    ev.items.forEach((i) => {
      grossEventsTotal += i.unitPrice * i.quantity * (i.isDayApplicable ? (i.days || 1) : 1);
      discountEventsTotal += i.discount;
      netEventsTotal += i.netAmount;
    });
  });

  const grossSubtotal = Number(decorCost || 0) + grossWeddingWide + grossEventsTotal;
  const totalItemDiscounts = discountWeddingWide + discountEventsTotal;
  const finalOfferedPrice = Number(decorCost || 0) + netWeddingWide + netEventsTotal;

  const totalPaymentsReceived = receivedPayments.reduce((sum, p) => sum + Number(p.amount), 0) + Number(advanceBookingAmount);
  const remainingDealBalance = Math.max(0, (closedDealAmount || finalOfferedPrice) - totalPaymentsReceived);

  // SAVE FULL CRM STATE
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "leads", leadId), {
        status: currentStage,
        closedDealAmount: Number(closedDealAmount) || 0,
        advanceBookingAmount: Number(advanceBookingAmount) || 0,
        receivedPayments,
        followup: {
          date: nextFollowupDate,
          time: nextFollowupTime,
          type: nextMeetingType,
          googleMeetLink: googleMeetLink.trim(),
          isDone: isFollowupDone,
        },
        activityLogs,
        quotation: {
          validityDate,
          decorCost: Number(decorCost) || 0,
          weddingWideItems,
          events: quoteEvents,
          paymentMilestones,
          customNotes: customQuoteNotes.trim(),
          grossSubtotal,
          totalDiscount: totalItemDiscounts,
          finalOfferedPrice,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.email,
        },
        updatedAt: new Date().toISOString(),
      });
      alert("✅ Sales CRM workspace and Quotation saved successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !lead) return <div className="p-12 text-center text-xl font-bold">Loading CRM Workspace...</div>;

  const wwMasterItem = otherItemsLibrary.find((i) => i.id === wwItemId);
  const evMasterItem = otherItemsLibrary.find((i) => i.id === evItemId);
  const currentStageObj = pipelineStages.find((s) => s.name === currentStage) || pipelineStages[0];

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 pb-20">
      {/* Top Banner */}
      <div className="bg-white border-b-2 border-gray-300 shadow-sm sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => router.push("/crm")}
                className="text-xs font-bold text-gray-600 hover:text-black flex items-center gap-1 bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-md border transition"
              >
                ← Back to Sales CRM
              </button>
            </div>

            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-gray-900">{lead.title}</h1>
              <span className={`text-xs font-black uppercase text-white px-3 py-1 rounded-full shadow ${currentStageObj.color}`}>
                {currentStage} ({currentStageObj.probability}%)
              </span>
            </div>
            <p className="text-xs font-semibold text-gray-600 mt-0.5">
              📍 {lead.resortName} | 📅 {lead.startDate} to {lead.endDate} | 👥 {lead.paxCount} Guests | 💼 {lead.salesLead?.name} ({lead.salesLead?.phone})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-black px-5 py-2.5 rounded-lg text-xs shadow transition disabled:opacity-50"
            >
              {saving ? "Saving..." : "💾 Save CRM Workspace"}
            </button>

            <Link
              href={`/crm/${leadId}/quote-pdf?mode=itemized`}
              target="_blank"
              className="bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-2.5 rounded-lg text-xs shadow transition flex items-center gap-1.5"
            >
              📑 Itemized PDF
            </Link>

            <Link
              href={`/crm/${leadId}/quote-pdf?mode=package`}
              target="_blank"
              className="bg-amber-600 hover:bg-amber-700 text-white font-black px-4 py-2.5 rounded-lg text-xs shadow transition flex items-center gap-1.5"
            >
              📑 Package PDF
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-6 space-y-6">

        {/* 1. VISUAL PIPELINE STEPPER (INFOGRAPHIC) */}
        <section className="bg-white border-2 border-gray-300 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
              📊 Interactive Sales Pipeline Progression (Click any stage to advance lead)
            </span>
            <span className="text-xs font-bold text-gray-500">
              Win Probability: <strong className="text-purple-700 font-mono text-sm">{currentStageObj.probability}%</strong>
            </span>
          </div>

          {/* Stepper Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {pipelineStages.filter((s) => s.name !== "Lost").map((stage, idx) => {
              const isActive = stage.name === currentStage;
              const isPast = pipelineStages.findIndex((s) => s.name === currentStage) >= idx;

              return (
                <button
                  key={stage.name}
                  onClick={() => handleStageChange(stage.name)}
                  className={`p-2.5 rounded-xl border-2 text-left transition flex flex-col justify-between ${
                    isActive
                      ? "bg-purple-900 text-white border-purple-950 shadow-md ring-2 ring-purple-500"
                      : isPast
                      ? "bg-purple-50 text-purple-900 border-purple-300 hover:bg-purple-100"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <span className="text-[10px] font-bold block opacity-80">Stage {idx + 1}</span>
                  <span className="text-xs font-black block leading-tight mt-0.5">{stage.name}</span>
                  <span className="text-[10px] font-mono mt-1 font-semibold">{stage.probability}% Win</span>
                </button>
              );
            })}
          </div>

          {/* Lost Toggle */}
          <div className="flex justify-end pt-1">
            <button
              onClick={() => handleStageChange("Lost")}
              className={`text-xs font-bold px-3 py-1 rounded-md border ${
                currentStage === "Lost" ? "bg-red-600 text-white border-red-700" : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
              }`}
            >
              {currentStage === "Lost" ? "✕ Deal Marked as Lost" : "Mark as Lost Deal"}
            </button>
          </div>
        </section>

        {/* 2. NEXT FOLLOW-UP & GOOGLE MEET SCHEDULER */}
        <section className={`border-2 rounded-2xl p-5 shadow-sm space-y-4 ${
          isFollowupOverdue() ? "bg-red-50/70 border-red-400" : "bg-white border-gray-300"
        }`}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">⏰</span>
              <div>
                <h3 className="font-black text-sm uppercase text-gray-900">
                  Next Scheduled Client Follow-Up & Meeting
                </h3>
                <p className="text-xs text-gray-500">
                  Stay on top of client touchpoints so no wedding inquiry falls through the cracks.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isFollowupOverdue() && (
                <span className="bg-red-600 text-white text-xs font-black px-2.5 py-1 rounded shadow animate-pulse">
                  🚨 Follow-Up Overdue!
                </span>
              )}
              {nextFollowupDate && !isFollowupDone && (
                <button
                  onClick={handleMarkFollowupComplete}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-black px-3.5 py-1.5 rounded-lg text-xs shadow flex items-center gap-1.5"
                >
                  ✓ Mark Follow-Up Completed
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-black text-gray-700 mb-1">Follow-Up Date</label>
              <input
                type="date"
                value={nextFollowupDate}
                onChange={(e) => {
                  setNextFollowupDate(e.target.value);
                  setIsFollowupDone(false);
                }}
                className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
              />
            </div>

            <div>
              <label className="block font-black text-gray-700 mb-1">Follow-Up Time</label>
              <input
                type="time"
                value={nextFollowupTime}
                onChange={(e) => {
                  setNextFollowupTime(e.target.value);
                  setIsFollowupDone(false);
                }}
                className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
              />
            </div>

            <div>
              <label className="block font-black text-gray-700 mb-1">Touchpoint Type</label>
              <select
                value={nextMeetingType}
                onChange={(e: any) => setNextMeetingType(e.target.value)}
                className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
              >
                <option value="Phone Call">📞 Phone Call</option>
                <option value="WhatsApp">💬 WhatsApp Follow-Up</option>
                <option value="Google Meet">📹 Google Meet / Video Call</option>
                <option value="Site Visit">📍 In-Person Resort Site Visit</option>
              </select>
            </div>

            <div>
              <label className="block font-black text-gray-700 mb-1">Google Meet / Meeting Link</label>
              <div className="flex gap-1">
                <input
                  placeholder="https://meet.google.com/..."
                  value={googleMeetLink}
                  onChange={(e) => setGoogleMeetLink(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-medium text-xs bg-white"
                />
                {googleMeetLink && (
                  <a
                    href={googleMeetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded-lg text-xs flex items-center"
                    title="Launch Meeting"
                  >
                    Join
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 3. CLIENT INTERACTION & COMMUNICATION TIMELINE FEED */}
        <section className="bg-white border-2 border-gray-300 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b pb-2 flex justify-between items-center">
            <div>
              <h3 className="font-black text-sm uppercase text-gray-900 flex items-center gap-2">
                💬 Communication Feed & Client Meeting Logs ({activityLogs.length})
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                Log what the client said during calls, meetings, WhatsApp, and their response to quotes.
              </p>
            </div>
          </div>

          {/* Log New Touchpoint Form */}
          <form onSubmit={handleLogActivity} className="bg-slate-50 p-4 rounded-xl border space-y-3 text-xs">
            <div className="flex items-center gap-2">
              <label className="font-black text-gray-700">Interaction Channel:</label>
              <div className="flex flex-wrap gap-1.5">
                {(["Call", "WhatsApp", "Google Meet", "Site Visit", "Internal Note"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActivityType(t)}
                    className={`px-3 py-1 rounded-full font-bold border transition ${
                      activityType === t ? "bg-purple-700 text-white border-purple-800" : "bg-white text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-black text-gray-700 mb-1">What did the client say? / Feedback *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Client liked the quotation, requested a 5% discount on the DJ sound package, and asked to meet at the resort on Saturday."
                  value={clientSaysInput}
                  onChange={(e) => setClientSaysInput(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-medium text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-black text-gray-700 mb-1">Agreed Next Action / Commitment</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Send revised package by tomorrow 2 PM and confirm availability with sound vendor."
                  value={nextActionInput}
                  onChange={(e) => setNextActionInput(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-medium text-xs bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-purple-700 hover:bg-purple-800 text-white font-black px-5 py-2 rounded-lg text-xs shadow"
              >
                + Log Client Touchpoint
              </button>
            </div>
          </form>

          {/* Timeline Feed Stream */}
          <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
            {activityLogs.map((log) => (
              <div key={log.id} className="bg-gray-50 border border-gray-200 p-3 rounded-xl text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-purple-950 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded text-[10px] uppercase">
                      {log.type}
                    </span>
                    <span className="font-bold text-gray-700">{log.author}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>

                <p className="text-gray-900 font-semibold leading-relaxed pt-0.5">
                  "{log.clientFeedback}"
                </p>

                {log.nextAction && (
                  <p className="text-[11px] text-blue-900 bg-blue-50 p-1.5 rounded font-medium border border-blue-100">
                    <strong>Next Action:</strong> {log.nextAction}
                  </p>
                )}
              </div>
            ))}

            {activityLogs.length === 0 && (
              <p className="text-center py-6 text-gray-400 font-bold text-xs italic">
                No client interactions recorded yet. Use the form above to log phone calls and client feedback.
              </p>
            )}
          </div>
        </section>

        {/* 4. DEAL CLOSURE & PAYMENT COLLECTIONS */}
        <section className="bg-white border-2 border-gray-300 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b pb-3">
            <div>
              <h2 className="text-xl font-black text-gray-900 uppercase">
                💰 Deal Closure & Payment Collections Tracker
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Record agreed booking amount, track advance payments, and calculate outstanding balance.
              </p>
            </div>

            <button
              onClick={() => setShowPaymentModal(true)}
              className="bg-purple-700 hover:bg-purple-800 text-white font-black px-4 py-2 rounded-lg text-xs shadow flex items-center gap-1.5"
            >
              + Log Received Payment
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-semibold">
            <div className="bg-slate-50 border p-3 rounded-xl">
              <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Final Agreed Deal Amount (₹)</label>
              <input
                type="number"
                placeholder="Total Closed Deal"
                value={closedDealAmount || ""}
                onChange={(e) => setClosedDealAmount(Number(e.target.value))}
                className="w-full border-2 border-gray-300 p-1.5 rounded-lg font-black text-base text-gray-900 font-mono bg-white"
              />
            </div>

            <div className="bg-slate-50 border p-3 rounded-xl">
              <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Initial Advance / Token (₹)</label>
              <input
                type="number"
                placeholder="Token amount"
                value={advanceBookingAmount || ""}
                onChange={(e) => setAdvanceBookingAmount(Number(e.target.value))}
                className="w-full border-2 border-gray-300 p-1.5 rounded-lg font-black text-base text-gray-900 font-mono bg-white"
              />
            </div>

            <div className="bg-green-50 border border-green-200 p-3 rounded-xl flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase text-green-800 block">Total Payments Received:</span>
              <strong className="text-xl font-black text-green-950 font-mono">
                ₹{totalPaymentsReceived.toLocaleString()}
              </strong>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase text-amber-900 block">Remaining Balance Due:</span>
              <strong className="text-xl font-black text-amber-950 font-mono">
                ₹{remainingDealBalance.toLocaleString()}
              </strong>
            </div>
          </div>

          {receivedPayments.length > 0 && (
            <div className="border rounded-xl overflow-hidden mt-3">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 font-bold uppercase text-[10px] text-gray-600">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Payment Mode</th>
                    <th className="p-2.5">Reference / Notes</th>
                    <th className="p-2.5 text-right">Amount Received (₹)</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-medium">
                  {receivedPayments.map((pay) => (
                    <tr key={pay.id} className="hover:bg-gray-50">
                      <td className="p-2.5 font-bold">{pay.date}</td>
                      <td className="p-2.5 text-purple-900 font-semibold">{pay.mode}</td>
                      <td className="p-2.5 text-gray-600">{pay.reference || "—"}</td>
                      <td className="p-2.5 text-right font-black font-mono text-green-700">₹{pay.amount?.toLocaleString()}</td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => handleDeleteReceivedPayment(pay.id)}
                          className="text-red-600 font-bold hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 5. QUOTATION BUILDER */}
        <section className="bg-white border-2 border-gray-300 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="border-b pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-black uppercase text-amber-700 tracking-wider">
                Proposal & Cost Breakdown
              </span>
              <h2 className="text-2xl font-black text-gray-900 mt-0.5">
                Client Quotation Generator
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs font-black text-gray-700">Quotation Valid Until *:</label>
              <input
                type="date"
                required
                value={validityDate}
                onChange={(e) => setValidityDate(e.target.value)}
                className="border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
              />
            </div>
          </div>

          {/* Core Decor Cost */}
          <div className="bg-amber-50/60 p-4 rounded-xl border-2 border-amber-300 space-y-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h3 className="font-black text-amber-950 text-sm uppercase">1. Core Wedding Decor Package</h3>
                <p className="text-xs text-amber-800">Overall decor package pricing for stage, entrance gates, canopies, and lighting styling.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-gray-700">Decor Cost (₹):</span>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 500000"
                  value={decorCost || ""}
                  onChange={(e) => setDecorCost(Number(e.target.value))}
                  className="w-44 border-2 border-amber-400 p-2 rounded-lg font-black text-base text-right font-mono bg-white"
                />
              </div>
            </div>
          </div>

          {/* SCOPE 1: WEDDING-WIDE ESSENTIALS */}
          <div className="space-y-4 bg-purple-50/50 p-4 rounded-2xl border-2 border-purple-200">
            <div className="flex justify-between items-center border-b border-purple-200 pb-2">
              <div>
                <h3 className="font-black text-purple-950 text-sm uppercase">
                  2. Wedding-Wide Essentials Scope (Non-Event Specific)
                </h3>
                <p className="text-xs text-purple-800">
                  Deliverables required across the entire wedding: Welcome hampers, luggage tags, itineraries, or multi-day artists.
                </p>
              </div>
              <span className="text-xs font-black bg-purple-200 text-purple-950 px-2.5 py-1 rounded-md">
                Subtotal: ₹{netWeddingWide.toLocaleString()}
              </span>
            </div>

            {/* Add Item Form */}
            <div className="bg-white p-3.5 rounded-xl border space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-black text-gray-700 mb-0.5">Select Item *</label>
                  <select
                    value={wwItemId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setWwItemId(id);
                      setWwVariantId("");
                      const it = otherItemsLibrary.find((x) => x.id === id);
                      if (it && checkIsDayUnit(it.pricingUnit)) setWwIsDayApplicable(true);
                      else setWwIsDayApplicable(false);
                    }}
                    className="w-full border p-1.5 rounded-lg font-bold text-xs bg-white text-gray-900"
                  >
                    <option value="">-- Choose Item from Library --</option>
                    {otherItemsLibrary.map((item) => (
                      <option key={item.id} value={item.id}>
                        [{item.category}] {item.name} {item.price ? `(₹${item.price} / ${item.pricingUnit === "Custom Unit" ? item.customUnit : item.pricingUnit})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-black text-gray-700 mb-0.5">Option / Variant</label>
                  <select
                    value={wwVariantId}
                    onChange={(e) => {
                      const vId = e.target.value;
                      setWwVariantId(vId);
                      const v = wwMasterItem?.variants?.find((x: any) => x.id === vId);
                      if (v && checkIsDayUnit(v.pricingUnit)) setWwIsDayApplicable(true);
                    }}
                    disabled={!wwMasterItem?.variants?.length}
                    className="w-full border p-1.5 rounded-lg font-bold text-xs bg-white disabled:opacity-50 text-gray-900"
                  >
                    <option value="">{wwMasterItem?.variants?.length ? "-- Choose Option --" : "Standard Specification"}</option>
                    {wwMasterItem?.variants?.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {v.name} (₹{v.price} / {v.pricingUnit === "Custom Unit" ? v.customUnit : v.pricingUnit})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-black text-gray-700 mb-0.5">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={wwQty}
                    onChange={(e) => setWwQty(Number(e.target.value))}
                    className="w-full border p-1.5 rounded-lg font-bold text-xs text-center bg-white"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-black text-gray-700 mb-0.5">Days</label>
                  {wwIsDayApplicable ? (
                    <input
                      type="number"
                      min="1"
                      value={wwDays}
                      onChange={(e) => setWwDays(Number(e.target.value))}
                      className="w-full border-2 border-purple-400 p-1.5 rounded-lg font-bold text-xs text-center bg-purple-50 text-purple-900"
                    />
                  ) : (
                    <div className="border border-dashed p-1.5 rounded-lg text-center text-gray-400 font-bold text-xs bg-gray-100">—</div>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-black text-gray-700 mb-0.5">Discount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Discount"
                    value={wwDiscount || ""}
                    onChange={(e) => setWwDiscount(Number(e.target.value))}
                    className="w-full border p-1.5 rounded-lg font-bold text-xs text-right bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="checkbox"
                  id="wwDayCheck"
                  checked={wwIsDayApplicable}
                  onChange={(e) => setWwIsDayApplicable(e.target.checked)}
                  className="h-3.5 w-3.5 accent-purple-600 rounded cursor-pointer"
                />
                <label htmlFor="wwDayCheck" className="text-[11px] font-bold text-gray-700 cursor-pointer">
                  Charge for multiple days? (Applies days multiplier to cost)
                </label>
              </div>

              <div className="flex gap-2">
                <input
                  placeholder="Distribution / logistics notes (e.g. Deliver 150 welcome hampers to reception on Day 0)..."
                  value={wwNotes}
                  onChange={(e) => setWwNotes(e.target.value)}
                  className="flex-1 border p-1.5 rounded-lg text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddWeddingWideItem}
                  className="bg-purple-700 hover:bg-purple-800 text-white font-black px-4 py-1.5 rounded-lg text-xs"
                >
                  + Add to Essentials
                </button>
              </div>
            </div>

            {/* Wedding-Wide Items Table */}
            {weddingWideItems.length > 0 && (
              <div className="border rounded-xl overflow-hidden bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 uppercase text-[10px] font-black text-gray-700">
                    <tr>
                      <th className="p-2.5">Item Name & Rider Terms</th>
                      <th className="p-2.5 text-center">Qty</th>
                      <th className="p-2.5 text-center">Days</th>
                      <th className="p-2.5 text-right">Rate</th>
                      <th className="p-2.5 text-right">Discount</th>
                      <th className="p-2.5 text-right">Net Amount (₹)</th>
                      <th className="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {weddingWideItems.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="p-2.5">
                          <span className="font-bold text-gray-900">{item.name}</span>
                          {item.variantName && <span className="text-purple-800 ml-1">({item.variantName})</span>}

                          {/* RIDER BADGES */}
                          {(item.riders?.travelCostAdditional || item.riders?.foodCostAdditional || item.riders?.roomsRequired || (item.riders?.customAttributes && item.riders.customAttributes.length > 0)) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.riders.travelCostAdditional && (
                                <span className="bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                  ✈️ Travel Extra
                                </span>
                              )}
                              {item.riders.foodCostAdditional && (
                                <span className="bg-orange-50 text-orange-900 border border-orange-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                  🍽️ Food Extra
                                </span>
                              )}
                              {item.riders.roomsRequired && (
                                <span className="bg-blue-50 text-blue-900 border border-blue-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                  🏨 Room Required
                                </span>
                              )}
                              {item.riders.customAttributes?.map((ca: string, caIdx: number) => (
                                <span key={caIdx} className="bg-gray-100 text-gray-800 border border-gray-300 px-1.5 py-0.2 rounded text-[10px] font-semibold">
                                  ⭐ {ca}
                                </span>
                              ))}
                            </div>
                          )}

                          {item.notes && <p className="text-[10px] text-gray-500 italic mt-0.5">{item.notes}</p>}
                        </td>
                        <td className="p-2.5 text-center font-bold">{item.quantity} {(!item.unit || item.unit.toLowerCase().includes("pc")) ? item.name : item.unit}</td>
                        <td className="p-2.5 text-center font-bold">
                          {item.isDayApplicable ? <span className="text-purple-900 bg-purple-100 px-2 py-0.5 rounded text-[11px]">{item.days} day(s)</span> : <span className="text-gray-400 font-bold">—</span>}
                        </td>
                        <td className="p-2.5 text-right font-mono">₹{item.unitPrice?.toLocaleString()}</td>
                        <td className="p-2.5 text-right text-red-600 font-mono">{item.discount > 0 ? `-₹${item.discount}` : "—"}</td>
                        <td className="p-2.5 text-right font-black font-mono text-gray-900">₹{item.netAmount?.toLocaleString()}</td>
                        <td className="p-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setWeddingWideItems(weddingWideItems.filter((i) => i.id !== item.id))}
                            className="text-red-600 font-bold hover:underline"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SCOPE 2: EVENT-WISE SCOPES */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-2">
              <div>
                <h3 className="font-black text-gray-900 text-sm uppercase">
                  3. Event-Wise Scopes Breakdown
                </h3>
                <p className="text-xs text-gray-500 font-medium">
                  Add specific events (Haldi, Mehendi, Sangeet) and itemize audio, SFX, artists, and live counters for each.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedEventToAdd}
                  onChange={(e) => {
                    if (e.target.value === "custom") setIsCustomEventModal(true);
                    else setSelectedEventToAdd(e.target.value);
                  }}
                  className="border-2 border-gray-400 p-1.5 rounded-lg font-bold text-xs bg-white text-gray-900"
                >
                  {availableEventTypes.map((ev) => (
                    <option key={ev} value={ev}>{ev}</option>
                  ))}
                  <option value="custom" className="text-purple-700 font-black">+ Create Custom Event Name...</option>
                </select>

                <button
                  type="button"
                  onClick={handleAddEventSection}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-1.5 rounded-lg text-xs shadow"
                >
                  + Add Event Scope
                </button>
              </div>
            </div>

            {/* Event Sections List */}
            <div className="space-y-6">
              {quoteEvents.map((evSection, evIdx) => {
                const eventNetTotal = evSection.items.reduce((sum, i) => sum + i.netAmount, 0);

                return (
                  <div key={evSection.id} className="bg-slate-50 border-2 border-slate-300 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between items-center border-b pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase bg-blue-100 text-blue-900 px-2.5 py-0.5 rounded">
                          🗓️ Event: {evSection.eventName}
                        </span>
                        <span className="text-xs font-black text-gray-700">
                          (Subtotal: ₹{eventNetTotal.toLocaleString()})
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveEventSection(evSection.id, evSection.eventName)}
                        className="text-red-600 hover:bg-red-50 px-2 py-0.5 rounded text-xs font-bold border border-red-200"
                      >
                        Remove Event
                      </button>
                    </div>

                    {/* Add Item to Event Form */}
                    <div className="bg-white p-3 rounded-xl border space-y-2 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-black text-gray-700 mb-0.5">Item *</label>
                          <select
                            value={activeEventIndexForAdd === evIdx ? evItemId : ""}
                            onChange={(e) => {
                              const id = e.target.value;
                              setActiveEventIndexForAdd(evIdx);
                              setEvItemId(id);
                              setEvVariantId("");
                              const it = otherItemsLibrary.find((x) => x.id === id);
                              if (it && checkIsDayUnit(it.pricingUnit)) setEvIsDayApplicable(true);
                              else setEvIsDayApplicable(false);
                            }}
                            className="w-full border p-1.5 rounded-lg font-bold text-xs bg-white text-gray-900"
                          >
                            <option value="">-- Choose Item for {evSection.eventName} --</option>
                            {otherItemsLibrary.map((item) => (
                              <option key={item.id} value={item.id}>
                                [{item.category}] {item.name} {item.price ? `(₹${item.price} / ${item.pricingUnit === "Custom Unit" ? item.customUnit : item.pricingUnit})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-black text-gray-700 mb-0.5">Option / Variant</label>
                          <select
                            value={activeEventIndexForAdd === evIdx ? evVariantId : ""}
                            onChange={(e) => {
                              const vId = e.target.value;
                              setEvVariantId(vId);
                              const v = evMasterItem?.variants?.find((x: any) => x.id === vId);
                              if (v && checkIsDayUnit(v.pricingUnit)) setEvIsDayApplicable(true);
                            }}
                            disabled={activeEventIndexForAdd !== evIdx || !evMasterItem?.variants?.length}
                            className="w-full border p-1.5 rounded-lg font-bold text-xs bg-white disabled:opacity-50 text-gray-900"
                          >
                            <option value="">{evMasterItem?.variants?.length ? "-- Choose Option --" : "Standard Setup"}</option>
                            {evMasterItem?.variants?.map((v: any) => (
                              <option key={v.id} value={v.id}>
                                {v.name} (₹{v.price} / {v.pricingUnit === "Custom Unit" ? v.customUnit : v.pricingUnit})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-black text-gray-700 mb-0.5">Qty *</label>
                          <input
                            type="number"
                            min="1"
                            value={activeEventIndexForAdd === evIdx ? evQty : 1}
                            onChange={(e) => {
                              setActiveEventIndexForAdd(evIdx);
                              setEvQty(Number(e.target.value));
                            }}
                            className="w-full border p-1.5 rounded-lg font-bold text-xs text-center bg-white"
                          />
                        </div>

                        <div className="sm:col-span-1">
                          <label className="block text-[11px] font-black text-gray-700 mb-0.5">Days</label>
                          {evIsDayApplicable && activeEventIndexForAdd === evIdx ? (
                            <input
                              type="number"
                              min="1"
                              value={evDays}
                              onChange={(e) => {
                                setActiveEventIndexForAdd(evIdx);
                                setEvDays(Number(e.target.value));
                              }}
                              className="w-full border-2 border-purple-400 p-1.5 rounded-lg font-bold text-xs text-center bg-purple-50 text-purple-900"
                            />
                          ) : (
                            <div className="border border-dashed p-1.5 rounded-lg text-center text-gray-400 font-bold text-xs bg-gray-100">—</div>
                          )}
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-black text-gray-700 mb-0.5">Discount (₹)</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="Discount"
                            value={activeEventIndexForAdd === evIdx ? (evDiscount || "") : ""}
                            onChange={(e) => {
                              setActiveEventIndexForAdd(evIdx);
                              setEvDiscount(Number(e.target.value));
                            }}
                            className="w-full border p-1.5 rounded-lg font-bold text-xs text-right bg-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-0.5">
                        <input
                          type="checkbox"
                          id={`evDayCheck_${evIdx}`}
                          checked={activeEventIndexForAdd === evIdx ? evIsDayApplicable : false}
                          onChange={(e) => {
                            setActiveEventIndexForAdd(evIdx);
                            setEvIsDayApplicable(e.target.checked);
                          }}
                          className="h-3.5 w-3.5 accent-purple-600 rounded cursor-pointer"
                        />
                        <label htmlFor={`evDayCheck_${evIdx}`} className="text-[11px] font-bold text-gray-700 cursor-pointer">
                          Charge for multiple days? (Applies days multiplier)
                        </label>
                      </div>

                      <div className="flex gap-2">
                        <input
                          placeholder="Execution instructions (e.g. Fire 6 cold pyros during couple entry)..."
                          value={activeEventIndexForAdd === evIdx ? evNotes : ""}
                          onChange={(e) => {
                            setActiveEventIndexForAdd(evIdx);
                            setEvNotes(e.target.value);
                          }}
                          className="flex-1 border p-1.5 rounded-lg text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddEventItem(evIdx)}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-1.5 rounded-lg text-xs"
                        >
                          + Add Item to {evSection.eventName}
                        </button>
                      </div>
                    </div>

                    {/* Items Table for this Event */}
                    {evSection.items.length > 0 && (
                      <div className="border rounded-xl overflow-hidden bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-100 uppercase text-[10px] font-black text-gray-700">
                            <tr>
                              <th className="p-2.5">Item Name & Rider Terms</th>
                              <th className="p-2.5 text-center">Qty</th>
                              <th className="p-2.5 text-center">Days</th>
                              <th className="p-2.5 text-right">Rate</th>
                              <th className="p-2.5 text-right">Discount</th>
                              <th className="p-2.5 text-right">Net Amount (₹)</th>
                              <th className="p-2.5 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {evSection.items.map((item) => (
                              <tr key={item.id} className="hover:bg-gray-50">
                                <td className="p-2.5">
                                  <span className="font-bold text-gray-900">{item.name}</span>
                                  {item.variantName && <span className="text-purple-800 ml-1">({item.variantName})</span>}

                                  {/* RIDER BADGES */}
                                  {(item.riders?.travelCostAdditional || item.riders?.foodCostAdditional || item.riders?.roomsRequired || (item.riders?.customAttributes && item.riders.customAttributes.length > 0)) && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {item.riders.travelCostAdditional && (
                                        <span className="bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                          ✈️ Travel Extra
                                        </span>
                                      )}
                                      {item.riders.foodCostAdditional && (
                                        <span className="bg-orange-50 text-orange-900 border border-orange-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                          🍽️ Food Extra
                                        </span>
                                      )}
                                      {item.riders.roomsRequired && (
                                        <span className="bg-blue-50 text-blue-900 border border-blue-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                          🏨 Room Required
                                        </span>
                                      )}
                                      {item.riders.customAttributes?.map((ca: string, caIdx: number) => (
                                        <span key={caIdx} className="bg-gray-100 text-gray-800 border border-gray-300 px-1.5 py-0.2 rounded text-[10px] font-semibold">
                                          ⭐ {ca}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {item.notes && <p className="text-[10px] text-gray-500 italic mt-0.5">{item.notes}</p>}
                                </td>
                                <td className="p-2.5 text-center font-bold">{item.quantity} {(!item.unit || item.unit.toLowerCase().includes("pc")) ? item.name : item.unit}</td>
                                <td className="p-2.5 text-center font-bold">
                                  {item.isDayApplicable ? <span className="text-purple-900 bg-purple-100 px-2 py-0.5 rounded text-[11px]">{item.days} day(s)</span> : <span className="text-gray-400 font-bold">—</span>}
                                </td>
                                <td className="p-2.5 text-right font-mono">₹{item.unitPrice?.toLocaleString()}</td>
                                <td className="p-2.5 text-right text-red-600 font-mono">{item.discount > 0 ? `-₹${item.discount}` : "—"}</td>
                                <td className="p-2.5 text-right font-black font-mono text-gray-900">₹{item.netAmount?.toLocaleString()}</td>
                                <td className="p-2.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveEventItem(evIdx, item.id)}
                                    className="text-red-600 font-bold hover:underline"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              {quoteEvents.length === 0 && (
                <div className="py-8 text-center text-gray-400 font-bold text-xs italic bg-gray-50 rounded-xl border-2 border-dashed">
                  No event scopes added yet. Select an event (e.g. Haldi, Sangeet) above and click "+ Add Event Scope".
                </div>
              )}
            </div>
          </div>

          {/* 3. Payment Milestones Schedule */}
          <div className="space-y-4 bg-slate-50 p-4 rounded-xl border-2 border-slate-300">
            <h3 className="font-black text-gray-900 text-sm uppercase border-b pb-1">
              4. Payment Terms & Milestone Schedule (% by Date)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
              <div className="md:col-span-2">
                <label className="block font-black text-gray-700 mb-1">% Percentage *</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={milestonePercent}
                  onChange={(e) => setMilestonePercent(Number(e.target.value))}
                  className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs text-center bg-white"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block font-black text-gray-700 mb-1">Due Date (Optional)</label>
                <input
                  type="date"
                  value={milestoneDate}
                  onChange={(e) => setMilestoneDate(e.target.value)}
                  className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white"
                />
              </div>

              <div className="md:col-span-5">
                <label className="block font-black text-gray-700 mb-1">Milestone Description *</label>
                <input
                  placeholder="e.g. Booking Advance, 15 Days Before Setup"
                  value={milestoneDesc}
                  onChange={(e) => setMilestoneDesc(e.target.value)}
                  className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                />
              </div>

              <div className="md:col-span-2 flex items-end">
                <button
                  type="button"
                  onClick={handleAddMilestone}
                  className="w-full bg-purple-700 hover:bg-purple-800 text-white font-black py-2 rounded-lg text-xs shadow"
                >
                  + Add Split
                </button>
              </div>
            </div>

            {paymentMilestones.length > 0 && (
              <div className="space-y-1.5 pt-2">
                {paymentMilestones.map((m) => {
                  const calculatedAmount = (finalOfferedPrice * m.percentage) / 100;
                  return (
                    <div key={m.id} className="flex justify-between items-center bg-white p-2.5 rounded-lg border text-xs shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-black bg-purple-100 text-purple-900 px-2 py-0.5 rounded text-xs">
                          {m.percentage}%
                        </span>
                        <span className="font-bold text-gray-900">{m.description}</span>
                        {m.dueDate && <span className="text-gray-500 font-semibold">(Due: {m.dueDate})</span>}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-gray-900">
                          ₹{Math.round(calculatedAmount).toLocaleString()}
                        </span>
                        <button
                          onClick={() => handleRemoveMilestone(m.id)}
                          className="text-red-600 font-bold hover:underline"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. Custom Notes & Legal Disclaimers */}
          <div>
            <label className="block text-xs font-black text-gray-800 mb-1">
              Custom Quotation Notes / Scope Inclusions & Exclusions
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Genset diesel to be provided by client / resort. Sound cutoff strictly at 10 PM as per local court guidelines."
              value={customQuoteNotes}
              onChange={(e) => setCustomQuoteNotes(e.target.value)}
              className="w-full border-2 border-gray-400 p-2.5 rounded-lg text-xs font-medium bg-white"
            />
          </div>

          <div className="bg-red-50 border-2 border-red-200 p-4 rounded-xl space-y-1 text-xs">
            <span className="font-black uppercase text-red-900 block text-[10px]">
              Mandatory Commercial Terms (Printed on all quotes):
            </span>
            <p className="text-red-950 font-bold">• "Any Government Tax Or Charges Will Be Charged Additionally"</p>
            <p className="text-red-950 font-bold">• "The Booking Amount Is Not Refundable"</p>
          </div>

          {/* 5. COMMERCIAL SUMMARY BOX */}
          <div className="bg-gray-900 text-white p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <p className="text-xs text-gray-400 font-bold uppercase">Commercial Proposal Summary</p>
              <h4 className="text-lg font-black text-white mt-0.5">Brajwal Weddings & Events Pvt Ltd</h4>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-right">
              <div>
                <span className="text-[10px] text-gray-400 uppercase block">Gross Amount</span>
                <span className="text-base font-bold font-mono text-gray-200">₹{grossSubtotal.toLocaleString()}</span>
              </div>

              <div>
                <span className="text-[10px] text-red-400 uppercase block">Total Discount</span>
                <span className="text-base font-bold font-mono text-red-400">
                  {totalItemDiscounts > 0 ? `-₹${totalItemDiscounts.toLocaleString()}` : "₹0"}
                </span>
              </div>

              <div className="border-l border-gray-700 pl-6">
                <span className="text-[10px] text-green-400 uppercase font-black block">Final Offered Price</span>
                <span className="text-3xl font-black font-mono text-green-400">₹{finalOfferedPrice.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* MODAL: CREATE PERMANENT CUSTOM EVENT */}
      {isCustomEventModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 border-2 border-purple-500 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-gray-900">Create Custom Event Name</h3>
            <p className="text-xs text-gray-600">This event name will be permanently saved to your catalog.</p>
            <input
              placeholder="e.g. Sufi Night, Carnival, Welcome Brunch"
              value={customEventInput}
              onChange={(e) => setCustomEventInput(e.target.value)}
              className="w-full border-2 border-purple-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900 outline-none"
            />
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setIsCustomEventModal(false)}
                className="px-3 py-1.5 border font-bold rounded text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePermanentCustomEvent}
                className="px-4 py-1.5 bg-purple-700 text-white font-black rounded text-xs shadow"
              >
                Save Event Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LOG RECEIVED PAYMENT */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 border-2 border-gray-400 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-lg font-black text-gray-900">Record Incoming Payment</h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-gray-500 font-black text-xl hover:text-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddReceivedPayment} className="space-y-3 text-xs">
              <div>
                <label className="block font-black text-gray-700 mb-1">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                />
              </div>

              <div>
                <label className="block font-black text-gray-700 mb-1">Amount Received (₹) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="e.g. 150000"
                  value={payAmount || ""}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-black text-sm bg-white"
                />
              </div>

              <div>
                <label className="block font-black text-gray-700 mb-1">Payment Mode *</label>
                <select
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-bold bg-white"
                >
                  <option value="Bank Transfer / NEFT / RTGS">Bank Transfer / NEFT / RTGS</option>
                  <option value="UPI / QR Code">UPI / QR Code</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>

              <div>
                <label className="block font-black text-gray-700 mb-1">Transaction Ref / Notes</label>
                <input
                  placeholder="e.g. UTR #12345678, Received via HDFC bank"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="w-full border-2 border-gray-300 p-2 rounded-lg font-medium bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-1.5 border font-bold rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 bg-green-700 hover:bg-green-800 text-white font-black rounded text-xs shadow"
                >
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}