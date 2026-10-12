"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { db } from "../../lib/firebase";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import type {
  StaffAccount,
  VendorAccount,
  VendorPurchase,
  GeneralStaffFloat,
  GeneralFloatExpense,
  AuditLogEntry,
} from "../../types/accounting";

export default function AccountingPage(): React.ReactElement {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  // SSR hydration safety flag
  const [isMounted, setIsMounted] = useState(false);

  // Access rights
  const isAccountant = role === "accountant";
  const canAccess = isSuperAdmin || isAccountant || role === "admin";

  // Data states
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>([]);
  const [vendors, setVendors] = useState<VendorAccount[]>([]);
  const [purchases, setPurchases] = useState<VendorPurchase[]>([]);
  const [floats, setFloats] = useState<GeneralStaffFloat[]>([]);
  const [expenses, setExpenses] = useState<GeneralFloatExpense[]>([]);
  const [crmWeddings, setCrmWeddings] = useState<any[]>([]);
  const [recentAudits, setRecentAudits] = useState<AuditLogEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Filter state
  const [selectedWeddingFilter, setSelectedWeddingFilter] = useState<string>("ALL");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && !loading && (!user || !canAccess)) {
      router.push("/handovers");
    }
  }, [isMounted, user, role, isSuperAdmin, loading, canAccess, router]);

  // Fetch all accounting ledgers & CRM deals from "leads" collection
  const loadDashboardData = async () => {
    try {
      setLoadingData(true);

      const [
        staffSnap,
        vendorSnap,
        purchSnap,
        floatSnap,
        expSnap,
        leadsSnap,
        auditSnap,
      ] = await Promise.all([
        getDocs(collection(db, "accounting_staff_accounts")),
        getDocs(collection(db, "accounting_vendors")),
        getDocs(collection(db, "accounting_vendor_purchases")),
        getDocs(collection(db, "accounting_general_floats")),
        getDocs(collection(db, "accounting_general_expenses")),
        getDocs(collection(db, "leads")).catch(() => ({ docs: [] })),
        getDocs(
          query(
            collection(db, "accounting_audit_logs"),
            orderBy("timestamp", "desc"),
            limit(10)
          )
        ).catch(() => ({ docs: [] })),
      ]);

      setStaffAccounts(staffSnap.docs.map((d) => ({ id: d.id, ...d.data() } as StaffAccount)));
      setVendors(vendorSnap.docs.map((d) => ({ id: d.id, ...d.data() } as VendorAccount)));
      setPurchases(purchSnap.docs.map((d) => ({ id: d.id, ...d.data() } as VendorPurchase)));
      setFloats(floatSnap.docs.map((d) => ({ id: d.id, ...d.data() } as GeneralStaffFloat)));
      setExpenses(expSnap.docs.map((d) => ({ id: d.id, ...d.data() } as GeneralFloatExpense)));

      // Filter CRM deals with status Booked / Deal Closed from "leads" collection
      const bookedWeddings = leadsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((w) => {
          const s = (w.status || "").toLowerCase();
          return s.includes("booked") || s.includes("deal closed");
        })
        .map((w) => {
          const closedDealAmount = Number(w.closedDealAmount || w.quotation?.finalOfferedPrice || 0);
          const advanceBookingAmount = Number(w.advanceBookingAmount || 0);
          const receivedPaymentsTotal = (w.receivedPayments || []).reduce(
            (sum: number, p: any) => sum + Number(p.amount || 0),
            0
          );
          const totalReceived = advanceBookingAmount + receivedPaymentsTotal;
          const remainingBalance = Math.max(0, closedDealAmount - totalReceived);

          return {
            id: w.id,
            clientName: w.title || w.clientName || `Wedding #${w.id}`,
            resortName: w.resortName || "Resort TBD",
            closedDealAmount,
            totalReceived,
            remainingBalance,
            paymentSchedule: w.quotation?.paymentMilestones || [],
            weddingDate: w.startDate,
          };
        });

      setCrmWeddings(bookedWeddings);

      setRecentAudits(
        auditSnap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLogEntry))
      );
    } catch (err) {
      console.error("Error fetching accounting telemetry:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isMounted && user && canAccess) {
      loadDashboardData();
    }
  }, [isMounted, user, canAccess]);

  // 1. Debt & Advance Balances
  const { totalVendorDebt, totalVendorAdvancePaid, totalStaffDues, totalStaffAdvance } =
    useMemo(() => {
      let vDebt = 0;
      let vAdv = 0;
      vendors.forEach((v) => {
        if (v.currentBalance > 0) vDebt += v.currentBalance;
        else if (v.currentBalance < 0) vAdv += Math.abs(v.currentBalance);
      });

      let sDue = 0;
      let sAdv = 0;
      staffAccounts.forEach((s) => {
        sDue += s.totalPendingDue || 0;
        sAdv += s.totalAdvanceGiven || 0;
      });

      return {
        totalVendorDebt: vDebt,
        totalVendorAdvancePaid: vAdv,
        totalStaffDues: sDue,
        totalStaffAdvance: sAdv,
      };
    }, [vendors, staffAccounts]);

  // 2. Fixed Commitments (Salaries + Recurring Bills)
  const { monthlyStaffSalaries, monthlyRecurringBills, totalMonthlyFixedBurn } =
    useMemo(() => {
      const salaries = staffAccounts.reduce((sum, s) => sum + (Number(s.monthlySalary) || 0), 0);

      let recurringBills = 0;
      purchases.forEach((p) => {
        if (p.isRecurring && p.recurringFrequency) {
          const amt = Number(p.amount) || 0;
          switch (p.recurringFrequency) {
            case "Daily":
              recurringBills += amt * 30;
              break;
            case "Weekly":
              recurringBills += amt * 4.33;
              break;
            case "Monthly":
              recurringBills += amt;
              break;
            case "Quarterly":
              recurringBills += amt / 3;
              break;
            case "Yearly":
              recurringBills += amt / 12;
              break;
          }
        }
      });

      return {
        monthlyStaffSalaries: Math.round(salaries),
        monthlyRecurringBills: Math.round(recurringBills),
        totalMonthlyFixedBurn: Math.round(salaries + recurringBills),
      };
    }, [staffAccounts, purchases]);

  // 3. Float Disbursal Deployed
  const totalActiveFloatBalance = useMemo(() => {
    return floats
      .filter((f) => f.status === "ACTIVE")
      .reduce((sum, f) => sum + (f.currentFloatBalance || 0), 0);
  }, [floats]);

  // 4. CRM Client Payment Schedule Pipeline
  const { totalUpcomingClientInflow, monthlyProjectedInflows } = useMemo(() => {
    let totalInflow = 0;
    const monthMap: Record<string, number> = {};

    crmWeddings.forEach((w) => {
      if (w.remainingBalance > 0) {
        totalInflow += w.remainingBalance;
        const monthLabel = w.weddingDate
          ? new Date(w.weddingDate).toLocaleString("default", {
              month: "short",
              year: "2-digit",
            })
          : "Upcoming";
        monthMap[monthLabel] = (monthMap[monthLabel] || 0) + w.remainingBalance;
      }
    });

    const sortedMonths = Object.keys(monthMap).map((m) => ({
      month: m,
      amount: monthMap[m],
    }));

    return {
      totalUpcomingClientInflow: totalInflow,
      monthlyProjectedInflows: sortedMonths,
    };
  }, [crmWeddings]);

  // 5. Category Spend Breakdown
  const categorySpendBreakdown = useMemo(() => {
    const map: Record<string, number> = {};

    purchases.forEach((p) => {
      if (
        selectedWeddingFilter === "ALL" ||
        p.linkedWeddingIds?.includes(selectedWeddingFilter)
      ) {
        const cat = vendors.find((v) => v.id === p.vendorId)?.category || "Vendor Purchases";
        map[cat] = (map[cat] || 0) + (Number(p.amount) || 0);
      }
    });

    expenses.forEach((e) => {
      if (
        selectedWeddingFilter === "ALL" ||
        e.linkedWeddingIds?.includes(selectedWeddingFilter)
      ) {
        const cat = e.purchaseType || "General Floats";
        map[cat] = (map[cat] || 0) + (Number(e.amount) || 0);
      }
    });

    return Object.keys(map)
      .map((cat) => ({
        name: cat,
        amount: map[cat],
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [purchases, expenses, vendors, selectedWeddingFilter]);

  const totalCalculatedSpend = useMemo(() => {
    return categorySpendBreakdown.reduce((sum, c) => sum + c.amount, 0);
  }, [categorySpendBreakdown]);

  // 6. Project/Wedding Spend Distribution
  const weddingSpendBreakdown = useMemo(() => {
    const map: Record<string, { name: string; amount: number }> = {};

    crmWeddings.forEach((w) => {
      map[w.id] = { name: w.clientName, amount: 0 };
    });

    purchases.forEach((p) => {
      if (p.linkedWeddingIds && p.linkedWeddingIds.length > 0) {
        const split = Number(p.amount) / p.linkedWeddingIds.length;
        p.linkedWeddingIds.forEach((wid) => {
          if (map[wid]) map[wid].amount += split;
        });
      }
    });

    expenses.forEach((e) => {
      if (e.linkedWeddingIds && e.linkedWeddingIds.length > 0) {
        const split = Number(e.amount) / e.linkedWeddingIds.length;
        e.linkedWeddingIds.forEach((wid) => {
          if (map[wid]) map[wid].amount += split;
        });
      }
    });

    return Object.values(map)
      .filter((w) => w.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [crmWeddings, purchases, expenses]);

  const INFOGRAPHIC_COLORS = [
    "#3b82f6",
    "#10b981",
    "#8b5cf6",
    "#f59e0b",
    "#ec4899",
    "#06b6d4",
    "#6366f1",
    "#f97316",
  ];

  if (!isMounted || loading || loadingData) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center font-mono text-xs uppercase tracking-widest text-neutral-600">
        COMPILING FINANCIAL TELEMETRY & CASHFLOW PIPELINE...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-neutral-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-neutral-300 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-neutral-950 rounded-full animate-pulse" />
              <p className="text-[10px] uppercase font-mono font-black tracking-widest text-neutral-500">
                BRAJWAL ERP / MASTER FINANCIAL INTELLIGENCE
              </p>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-neutral-950 mt-1">
              Executive Accounting & Cashflow Analytics
            </h1>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <Link
              href="/accounting/staff"
              className="px-3.5 py-2 rounded-lg bg-white border border-neutral-300 font-black uppercase text-neutral-800 hover:bg-neutral-100 transition shadow-sm"
            >
              👥 Staff Ledgers
            </Link>
            <Link
              href="/accounting/vendors"
              className="px-3.5 py-2 rounded-lg bg-white border border-neutral-300 font-black uppercase text-neutral-800 hover:bg-neutral-100 transition shadow-sm"
            >
              🏭 Vendor Accounts
            </Link>
            <Link
              href="/accounting/general"
              className="px-3.5 py-2 rounded-lg bg-white border border-neutral-300 font-black uppercase text-neutral-800 hover:bg-neutral-100 transition shadow-sm"
            >
              💳 Field Floats
            </Link>
          </div>
        </div>

        {/* Global Filter Bar */}
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] flex flex-col md:flex-row items-center justify-between gap-4 font-mono text-xs">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <span className="font-black uppercase text-neutral-500 text-[11px]">Filter by Wedding:</span>
            <select
              value={selectedWeddingFilter}
              onChange={(e) => setSelectedWeddingFilter(e.target.value)}
              className="border border-neutral-300 p-2 rounded-lg bg-neutral-50 text-neutral-900 font-bold outline-none flex-1 md:w-72"
            >
              <option value="ALL">All Active Booked Weddings ({crmWeddings.length})</option>
              {crmWeddings.map((w) => (
                <option key={w.id} value={w.id}>
                  💍 {w.clientName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-neutral-400">
            <span>REAL-TIME AUDIT LOGS ACTIVE</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          </div>
        </div>

        {/* 4 Core Financial Pillar Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
            <p className="text-[10px] font-mono uppercase font-black tracking-widest text-neutral-400">
              Company Debt (Vendor Payables)
            </p>
            <p className="text-2xl font-black font-mono text-neutral-950 mt-2">
              ₹{totalVendorDebt.toLocaleString()}
            </p>
            <div className="mt-3 pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] font-mono text-neutral-500">
              <span>Advance Paid:</span>
              <strong className="text-amber-600">₹{totalVendorAdvancePaid.toLocaleString()}</strong>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-purple-500" />
            <p className="text-[10px] font-mono uppercase font-black tracking-widest text-neutral-400">
              Monthly Fixed Expenses Burn
            </p>
            <p className="text-2xl font-black font-mono text-neutral-950 mt-2">
              ₹{totalMonthlyFixedBurn.toLocaleString()}
              <span className="text-xs text-neutral-400 font-normal"> / mo</span>
            </p>
            <div className="mt-3 pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] font-mono text-neutral-500">
              <span>Salaries: ₹{monthlyStaffSalaries.toLocaleString()}</span>
              <span>Recurring: ₹{monthlyRecurringBills.toLocaleString()}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <p className="text-[10px] font-mono uppercase font-black tracking-widest text-neutral-400">
              CRM Expected Client Inflows
            </p>
            <p className="text-2xl font-black font-mono text-emerald-600 mt-2">
              ₹{totalUpcomingClientInflow.toLocaleString()}
            </p>
            <div className="mt-3 pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] font-mono text-neutral-500">
              <span>From Booked Pipeline:</span>
              <strong className="text-neutral-800">{crmWeddings.length} Deals</strong>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
            <p className="text-[10px] font-mono uppercase font-black tracking-widest text-neutral-400">
              Floats & Field Advances Deployed
            </p>
            <p className="text-2xl font-black font-mono text-neutral-950 mt-2">
              ₹{(totalActiveFloatBalance + totalStaffAdvance).toLocaleString()}
            </p>
            <div className="mt-3 pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] font-mono text-neutral-500">
              <span>Staff Advance: ₹{totalStaffAdvance.toLocaleString()}</span>
              <span>Floats: ₹{totalActiveFloatBalance.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Infographic Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-neutral-100 pb-3">
              <div>
                <h3 className="font-mono font-black text-sm uppercase tracking-wider text-neutral-950">
                  Client Inflow Forecast vs Monthly Fixed Burn
                </h3>
                <p className="text-[11px] font-mono text-neutral-400">
                  Projected revenue installments from Booked CRM contracts against ₹
                  {totalMonthlyFixedBurn.toLocaleString()} fixed overhead
                </p>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-mono font-bold">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500" /> Client Inflow
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-1 bg-purple-500" /> Fixed Burn Line
                </span>
              </div>
            </div>

            {monthlyProjectedInflows.length === 0 ? (
              <div className="py-16 text-center text-xs font-mono text-neutral-400">
                NO PAYMENT SCHEDULES FOUND IN CRM WEDDINGS.
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                {monthlyProjectedInflows.map((item, idx) => {
                  const maxInflow = Math.max(
                    ...monthlyProjectedInflows.map((i) => i.amount),
                    totalMonthlyFixedBurn || 1
                  );
                  const percentage = Math.min(100, Math.round((item.amount / maxInflow) * 100));
                  const isSurplus = item.amount >= totalMonthlyFixedBurn;

                  return (
                    <div key={idx} className="space-y-1 font-mono text-xs">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="font-black text-neutral-900">{item.month}</span>
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold text-[9px] ${
                              isSurplus
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {isSurplus ? "NET SURPLUS" : "CASH DEFICIT"}
                          </span>
                          <span className="font-black text-neutral-950">
                            ₹{item.amount.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-5 bg-neutral-100 rounded-lg overflow-hidden relative flex items-center">
                        <div
                          style={{ width: `${percentage}%` }}
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-lg transition-all duration-500"
                        />
                        <div
                          style={{
                            left: `${Math.min(
                              98,
                              Math.round((totalMonthlyFixedBurn / maxInflow) * 100)
                            )}%`,
                          }}
                          className="absolute top-0 bottom-0 w-0.5 bg-purple-600 shadow-sm z-10"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] space-y-4">
            <div className="border-b border-neutral-100 pb-3">
              <h3 className="font-mono font-black text-sm uppercase tracking-wider text-neutral-950">
                Expenditure by Category
              </h3>
              <p className="text-[11px] font-mono text-neutral-400">
                Total Tracked Spend: ₹{totalCalculatedSpend.toLocaleString()}
              </p>
            </div>

            {categorySpendBreakdown.length === 0 ? (
              <div className="py-12 text-center text-xs font-mono text-neutral-400">
                NO CATEGORIZED EXPENDITURES RECORDED.
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {categorySpendBreakdown.slice(0, 6).map((cat, i) => {
                  const share =
                    totalCalculatedSpend > 0
                      ? Math.round((cat.amount / totalCalculatedSpend) * 100)
                      : 0;
                  const color = INFOGRAPHIC_COLORS[i % INFOGRAPHIC_COLORS.length];

                  return (
                    <div key={i} className="space-y-1 font-mono text-xs">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="font-bold text-neutral-800 truncate max-w-[160px]">
                          {cat.name}
                        </span>
                        <span className="font-black text-neutral-900">
                          ₹{cat.amount.toLocaleString()} ({share}%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${share}%`, backgroundColor: color }}
                          className="h-full rounded-full transition-all duration-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Project Cost Allocation */}
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] space-y-4">
          <div className="border-b border-neutral-100 pb-3">
            <h3 className="font-mono font-black text-sm uppercase tracking-wider text-neutral-950">
              Project Cost Allocation (Per Booked Wedding)
            </h3>
            <p className="text-[11px] font-mono text-neutral-400">
              Cross-ledger tracking of vendor contracts and staff float disbursements per wedding
            </p>
          </div>

          {weddingSpendBreakdown.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-neutral-400">
              NO EXPENSES ATTRIBUTED TO WEDDINGS YET.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 font-mono">
              {weddingSpendBreakdown.map((w, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 hover:bg-neutral-100/80 transition space-y-2"
                >
                  <p className="font-black text-xs text-neutral-950 truncate">💍 {w.name}</p>
                  <div className="flex justify-between items-baseline pt-1">
                    <span className="text-[10px] uppercase text-neutral-500">Total Incurred:</span>
                    <span className="text-base font-black text-neutral-950">
                      ₹{Math.round(w.amount).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audit Trail */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] overflow-hidden">
          <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
            <div>
              <h3 className="font-mono font-black text-xs uppercase tracking-wider text-neutral-950">
                Tamper-Proof Financial Audit Trail (Live Logs)
              </h3>
              <p className="text-[11px] font-mono text-neutral-500">
                Non-editable record of who changed what, when, and payment details
              </p>
            </div>
            <span className="text-[10px] font-mono font-black bg-neutral-950 text-white px-2.5 py-1 rounded">
              APPEND-ONLY
            </span>
          </div>

          <div className="divide-y divide-neutral-100 max-h-72 overflow-y-auto">
            {recentAudits.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-neutral-400">
                NO AUDIT LOGS FILED YET.
              </div>
            ) : (
              recentAudits.map((a, i) => (
                <div key={i} className="p-3.5 hover:bg-neutral-50/70 transition flex items-start justify-between font-mono text-xs gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black px-2 py-0.5 rounded bg-neutral-200 text-neutral-900 border border-neutral-300">
                        {a.module}
                      </span>
                      <span className="font-bold text-neutral-950">{a.targetName}</span>
                    </div>
                    <p className="text-[11px] text-neutral-600">{a.notes}</p>
                  </div>

                  <div className="text-right text-[10px] text-neutral-400 whitespace-nowrap">
                    <div>{new Date(a.timestamp).toLocaleString()}</div>
                    <div className="text-neutral-500 font-bold">{a.performedByEmail}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}