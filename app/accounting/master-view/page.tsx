"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { db } from "../../../lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useAuth } from "../../../context/AuthContext";
import { useRouter } from "next/navigation";
import type {
  StaffTransaction,
  VendorPurchase,
  VendorTransaction,
  GeneralStaffFloat,
  GeneralFloatExpense,
} from "../../../types/accounting";

export default function MasterConsolidatedDashboard(): React.ReactElement {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  const isAccountant = (role as unknown as string) === "accountant";
  const canAccess = isSuperAdmin || isAccountant || (role as unknown as string) === "admin";

  const [isMounted, setIsMounted] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Raw fetched data
  const [staffTxns, setStaffTxns] = useState<StaffTransaction[]>([]);
  const [vendorPurchases, setVendorPurchases] = useState<VendorPurchase[]>([]);
  const [vendorTxns, setVendorTxns] = useState<VendorTransaction[]>([]);
  const [floats, setFloats] = useState<GeneralStaffFloat[]>([]);
  const [floatExpenses, setFloatExpenses] = useState<GeneralFloatExpense[]>([]);
  const [crmLeads, setCrmLeads] = useState<any[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

  // Filter States
  const [selectedModule, setSelectedModule] = useState<"ALL" | "STAFF" | "VENDOR" | "GENERAL" | "CLIENT">("ALL");
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Drill-down Modal State
  const [inspectedItem, setInspectedItem] = useState<any | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && !loading && (!user || !canAccess)) {
      router.push("/");
    }
  }, [isMounted, user, role, isSuperAdmin, loading, canAccess, router]);

  const loadMasterData = async () => {
    try {
      setLoadingData(true);
      const [
        staffSnap,
        vPurchSnap,
        vTxnSnap,
        floatSnap,
        expSnap,
        leadsSnap,
        usersSnap,
      ] = await Promise.all([
        getDocs(collection(db, "accounting_staff_transactions")),
        getDocs(collection(db, "accounting_vendor_purchases")),
        getDocs(collection(db, "accounting_vendor_transactions")),
        getDocs(collection(db, "accounting_general_floats")),
        getDocs(collection(db, "accounting_general_expenses")),
        getDocs(collection(db, "leads")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "users")),
      ]);

      const uMap: Record<string, string> = {};
      usersSnap.docs.forEach((d) => {
        const data = d.data();
        uMap[d.id] = data.displayName || data.email || "Staff Member";
      });
      setUsersMap(uMap);

      setStaffTxns(staffSnap.docs.map((d) => ({ id: d.id, ...d.data() } as StaffTransaction)));
      setVendorPurchases(vPurchSnap.docs.map((d) => ({ id: d.id, ...d.data() } as VendorPurchase)));
      setVendorTxns(vTxnSnap.docs.map((d) => ({ id: d.id, ...d.data() } as VendorTransaction)));
      setFloats(floatSnap.docs.map((d) => ({ id: d.id, ...d.data() } as GeneralStaffFloat)));
      setFloatExpenses(expSnap.docs.map((d) => ({ id: d.id, ...d.data() } as GeneralFloatExpense)));
      setCrmLeads(leadsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any)));
    } catch (err) {
      console.error("Error loading master consolidated ledger:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isMounted && user && canAccess) {
      loadMasterData();
    }
  }, [isMounted, user, canAccess]);

  const unifiedLedger = useMemo(() => {
    const list: any[] = [];

    // 1. Client Inflows (CRM Received Payments & Advances)
    crmLeads.forEach((lead) => {
      const clientName = lead.title || lead.clientName || `Wedding #${lead.id}`;

      // Initial Advance / Token Payment if recorded
      if (Number(lead.advanceBookingAmount) > 0) {
        list.push({
          id: `${lead.id}_advance`,
          date: lead.createdAt?.split("T")[0] || new Date().toISOString().split("T")[0],
          module: "CLIENT",
          category: "ADVANCE_BOOKING_TOKEN",
          partyName: `${clientName} (Client)`,
          debit: 0,
          credit: Number(lead.advanceBookingAmount),
          paymentMode: "CRM Initial Token",
          accountOrUpi: lead.resortName || "Booked Wedding",
          remarks: `Initial advance booking payment for ${clientName}`,
          raw: lead,
        });
      }

      // Logged Received Payments
      if (Array.isArray(lead.receivedPayments)) {
        lead.receivedPayments.forEach((pay: any) => {
          list.push({
            id: pay.id || `${lead.id}_pay_${Math.random()}`,
            date: pay.date || new Date().toISOString().split("T")[0],
            module: "CLIENT",
            category: "CLIENT_PAYMENT_RECEIVED",
            partyName: `${clientName} (Client)`,
            debit: 0,
            credit: Number(pay.amount || 0),
            paymentMode: pay.mode || "Bank / UPI",
            accountOrUpi: pay.reference || "CRM Payment Log",
            remarks: `Payment received from client. Ref: ${pay.reference || "None"}`,
            raw: pay,
          });
        });
      }
    });

    // 2. Staff Transactions
    staffTxns.forEach((t) => {
      const staffName = usersMap[t.staffUid] || "Staff Member";
      list.push({
        id: t.id,
        date: t.date || t.createdAt?.split("T")[0],
        module: "STAFF",
        category: t.type,
        partyName: staffName,
        debit: t.amount,
        credit: 0,
        paymentMode: t.paymentDetails?.mode || "—",
        accountOrUpi: t.paymentDetails?.upiId || t.paymentDetails?.toAccountNumber || t.paymentDetails?.cashDescription || "—",
        remarks: t.remarks || "Staff Ledger Entry",
        raw: t,
      });
    });

    // 3. Vendor Purchases
    vendorPurchases.forEach((p) => {
      list.push({
        id: p.id,
        date: p.date || p.createdAt?.split("T")[0],
        module: "VENDOR",
        category: `PURCHASE (${p.type})`,
        partyName: p.vendorName || "Vendor",
        debit: p.amount,
        credit: 0,
        paymentMode: "Bill / Procurement",
        accountOrUpi: p.linkedWeddingNames?.join(", ") || "General Purchase",
        remarks: p.itemsDescription,
        raw: p,
      });
    });

    // 4. Vendor Transactions (Disbursements)
    vendorTxns.forEach((t) => {
      list.push({
        id: t.id,
        date: t.date || t.createdAt?.split("T")[0],
        module: "VENDOR",
        category: `VENDOR ${t.type}`,
        partyName: "Vendor Disbursement",
        debit: 0,
        credit: t.amount,
        paymentMode: t.paymentDetails?.mode || "—",
        accountOrUpi: t.paymentDetails?.upiId || t.paymentDetails?.toAccountNumber || t.paymentDetails?.transactionId || "—",
        remarks: t.remarks || "Vendor Payment",
        raw: t,
      });
    });

    // 5. General Staff Floats
    floats.forEach((f) => {
      list.push({
        id: f.id,
        date: f.createdAt?.split("T")[0],
        module: "GENERAL",
        category: `FLOAT DISBURSAL (${f.status})`,
        partyName: f.staffName,
        debit: f.initialDisbursedAmount + (f.totalTopUpAmount || 0),
        credit: 0,
        paymentMode: f.disbursementPaymentDetails?.mode || "—",
        accountOrUpi: f.disbursementPaymentDetails?.toAccountNumber || f.disbursementPaymentDetails?.upiId || "—",
        remarks: `Initial Float: ₹${f.initialDisbursedAmount} + Topups: ₹${f.totalTopUpAmount || 0}`,
        raw: f,
      });
    });

    // 6. General Float Expenses
    floatExpenses.forEach((e) => {
      const parentFloat = floats.find((f) => f.id === e.floatId);
      list.push({
        id: e.id,
        date: e.date || e.createdAt?.split("T")[0],
        module: "GENERAL",
        category: `EXPENSE (${e.purchaseType})`,
        partyName: `${parentFloat?.staffName || "Staff"} (Float Expense)`,
        debit: e.amount,
        credit: 0,
        paymentMode: "Petty Float Spend",
        accountOrUpi: "Staff Float Balance",
        remarks: e.purchaseDetails,
        raw: e,
      });
    });

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [staffTxns, vendorPurchases, vendorTxns, floats, floatExpenses, crmLeads, usersMap]);

  // Filtered Ledger
  const filteredLedger = useMemo(() => {
    return unifiedLedger.filter((item) => {
      if (selectedModule !== "ALL" && item.module !== selectedModule) return false;
      if (selectedMonth !== "ALL" && item.date && !item.date.startsWith(selectedMonth)) return false;
      if (startDate && item.date && item.date < startDate) return false;
      if (endDate && item.date && item.date > endDate) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchParty = item.partyName?.toLowerCase().includes(q);
        const matchRemarks = item.remarks?.toLowerCase().includes(q);
        const matchMode = item.paymentMode?.toLowerCase().includes(q);
        if (!matchParty && !matchRemarks && !matchMode) return false;
      }

      return true;
    });
  }, [unifiedLedger, selectedModule, selectedMonth, startDate, endDate, searchQuery]);

  const { totalDebit, totalCredit, netCompanyFlow } = useMemo(() => {
    let deb = 0;
    let cred = 0;
    filteredLedger.forEach((i) => {
      deb += i.debit || 0;
      cred += i.credit || 0;
    });
    return { totalDebit: deb, totalCredit: cred, netCompanyFlow: cred - deb };
  }, [filteredLedger]);

  if (!isMounted || loading || loadingData) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center font-mono text-xs uppercase tracking-widest text-neutral-600">
        COMPILING MASTER CONSOLIDATED LEDGER...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-neutral-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-300">
          <button
            onClick={() => router.push("/accounting")}
            className="text-xs font-bold text-gray-700 hover:text-black flex items-center gap-1 bg-white border border-gray-300 px-3.5 py-1.5 rounded-lg shadow-sm transition font-mono"
          >
            ← Back to Accounting Dashboard
          </button>
          <span className="text-[10px] font-mono font-black uppercase bg-neutral-900 text-white px-3 py-1 rounded">
            🔒 View-Only Master Ledger
          </span>
        </div>

        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-neutral-950">
            Master Consolidated Company Ledger
          </h1>
          <p className="text-xs text-neutral-500 font-mono mt-1">
            Unified view of all Client Inflows, Staff, Vendor, and General Float transactions.
          </p>
        </div>

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm">
            <p className="text-[10px] uppercase font-black text-neutral-400">Total Outflows (Debits / Expenses)</p>
            <p className="text-2xl font-black text-rose-600 mt-1">₹{totalDebit.toLocaleString()}</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm">
            <p className="text-[10px] uppercase font-black text-neutral-400">Total Inflows (Client Payments Received)</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">₹{totalCredit.toLocaleString()}</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm">
            <p className="text-[10px] uppercase font-black text-neutral-400">Net Treasury Flow</p>
            <p className={`text-2xl font-black mt-1 ${netCompanyFlow >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              ₹{netCompanyFlow.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm space-y-3 font-mono text-xs">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
              {(["ALL", "CLIENT", "STAFF", "VENDOR", "GENERAL"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedModule(m)}
                  className={`px-4 py-2 rounded-lg font-black uppercase text-xs transition ${
                    selectedModule === m ? "bg-neutral-950 text-white shadow-sm" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  {m === "ALL" ? "🌐 Entire Company" : m === "CLIENT" ? "💰 Client Inflows" : m === "STAFF" ? "👥 Staff Ledger" : m === "VENDOR" ? "🏭 Vendors" : "💳 General Floats"}
                </button>
              ))}
            </div>

            <div className="w-full md:w-72">
              <input
                type="text"
                placeholder="Search party, remarks, mode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border border-neutral-300 p-2 rounded-lg bg-neutral-50 text-neutral-900 outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-neutral-200">
            <div className="flex items-center gap-2">
              <span className="font-bold text-neutral-500 uppercase text-[10px]">Filter Month:</span>
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setStartDate("");
                  setEndDate("");
                }}
                className="border border-neutral-300 p-1.5 rounded bg-neutral-50 font-bold"
              >
                <option value="ALL">All Months</option>
                <option value="2026-01">Jan 2026</option>
                <option value="2026-02">Feb 2026</option>
                <option value="2026-03">Mar 2026</option>
                <option value="2026-04">Apr 2026</option>
                <option value="2026-05">May 2026</option>
                <option value="2026-06">Jun 2026</option>
                <option value="2026-07">Jul 2026</option>
                <option value="2026-08">Aug 2026</option>
                <option value="2026-09">Sep 2026</option>
                <option value="2026-10">Oct 2026</option>
                <option value="2026-11">Nov 2026</option>
                <option value="2026-12">Dec 2026</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-neutral-500 uppercase text-[10px]">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setSelectedMonth("ALL");
                }}
                className="border border-neutral-300 p-1.5 rounded bg-neutral-50 font-bold"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-neutral-500 uppercase text-[10px]">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setSelectedMonth("ALL");
                }}
                className="border border-neutral-300 p-1.5 rounded bg-neutral-50 font-bold"
              />
            </div>

            {(startDate || endDate || selectedMonth !== "ALL" || searchQuery || selectedModule !== "ALL") && (
              <button
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                  setSelectedMonth("ALL");
                  setSearchQuery("");
                  setSelectedModule("ALL");
                }}
                className="text-rose-600 font-bold hover:underline text-[11px]"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Master Ledger Table */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-white border-b border-neutral-200 text-neutral-400 text-[10px] uppercase">
                <tr>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Module</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Party / Beneficiary</th>
                  <th className="p-3.5 text-right">Debit (-)</th>
                  <th className="p-3.5 text-right">Credit (+)</th>
                  <th className="p-3.5">Mode</th>
                  <th className="p-3.5">Remarks</th>
                  <th className="p-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium">
                {filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-neutral-400 font-mono text-xs">
                      NO TRANSACTIONS FOUND.
                    </td>
                  </tr>
                ) : (
                  filteredLedger.map((item) => (
                    <tr key={item.id} className="hover:bg-neutral-50/80 transition">
                      <td className="p-3.5 font-bold whitespace-nowrap">{item.date}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${item.module === "CLIENT" ? "bg-emerald-50 text-emerald-800 border-emerald-300" : item.module === "STAFF" ? "bg-purple-50 text-purple-800 border-purple-300" : item.module === "VENDOR" ? "bg-blue-50 text-blue-800 border-blue-300" : "bg-teal-50 text-teal-800 border-teal-300"}`}>
                          {item.module}
                        </span>
                      </td>
                      <td className="p-3.5 font-bold text-neutral-800 whitespace-nowrap">{item.category}</td>
                      <td className="p-3.5 font-black text-neutral-950">{item.partyName}</td>
                      <td className="p-3.5 text-right font-black text-rose-600 whitespace-nowrap">{item.debit > 0 ? `₹${item.debit.toLocaleString()}` : "—"}</td>
                      <td className="p-3.5 text-right font-black text-emerald-600 whitespace-nowrap">{item.credit > 0 ? `₹${item.credit.toLocaleString()}` : "—"}</td>
                      <td className="p-3.5 text-neutral-600 text-[11px]">{item.paymentMode}</td>
                      <td className="p-3.5 text-neutral-600 max-w-xs text-[11px] truncate">{item.remarks}</td>
                      <td className="p-3.5 text-center">
                        <button onClick={() => setInspectedItem(item)} className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-900 hover:text-white rounded font-bold text-[10px] transition">
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}