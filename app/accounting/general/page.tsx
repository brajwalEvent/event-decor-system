"use client";

import React, { useState, useEffect } from "react";
import { db } from "../../../lib/firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc,
  query,
  orderBy,
  where,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "../../../context/AuthContext";
import { useRouter } from "next/navigation";
import type {
  GeneralStaffFloat,
  GeneralFloatExpense,
  PaymentMode,
  PaymentDetails,
} from "../../../types/accounting";
import { recordAuditLog } from "../../../lib/accountingAudit";

export default function GeneralCreditLedgerPage(): React.ReactElement {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  // Hardcoded Read-Only Auditor / Viewer
  const READ_ONLY_EMAIL = "itsmanisharora@gmail.com";
  const isReadOnlyViewer =
    user?.email?.toLowerCase().trim() === READ_ONLY_EMAIL.toLowerCase().trim();

  const isAccountant = (role as any) === "accountant";
  const canAccess =
    isSuperAdmin || isAccountant || role === "admin" || isReadOnlyViewer;

  // Management Permission (Hidden from Read-Only Viewer)
  const canManageFloats =
    !isReadOnlyViewer && (isSuperAdmin || isAccountant || role === "admin");

  // Data States
  const [activeFloats, setActiveFloats] = useState<GeneralStaffFloat[]>([]);
  const [settledFloats, setSettledFloats] = useState<GeneralStaffFloat[]>([]);
  const [selectedFloat, setSelectedFloat] = useState<GeneralStaffFloat | null>(null);
  const [expenses, setExpenses] = useState<GeneralFloatExpense[]>([]);
  const [fundingHistoryList, setFundingHistoryList] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [vendorsList, setVendorsList] = useState<any[]>([]);
  const [crmWeddings, setCrmWeddings] = useState<any[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<string[]>([
    "Resort / Hotel Stay",
    "Team Food & Meals",
    "Vehicle Fuel (Diesel/Petrol)",
    "Fastag & Tolls",
    "Internet & Mobile Recharge",
    "Local Hardware / Procurement",
    "Freight & Rickshaw / Auto",
    "Emergency Miscellaneous",
  ]);
  const [loadingData, setLoadingData] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"ACTIVE" | "SETTLED">("ACTIVE");

  // Modals
  const [showOpenFloatModal, setShowOpenFloatModal] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showFloatVendorPayModal, setShowFloatVendorPayModal] = useState(false);
  const [showFloatStaffPayModal, setShowFloatStaffPayModal] = useState(false);
  const [showFundingHistoryModal, setShowFundingHistoryModal] = useState(false);
  const [showTransferFloatModal, setShowTransferFloatModal] = useState(false);

  // States for Float Vendor Payment
  const [selectedVendorForFloatPay, setSelectedVendorForFloatPay] = useState<any | null>(null);
  const [floatVendorPayAmount, setFloatVendorPayAmount] = useState<number | "">("");
  const [floatVendorPayMode, setFloatVendorPayMode] = useState<PaymentMode>("Cash");
  const [floatVendorPayTxnType, setFloatVendorPayTxnType] = useState<"PAYMENT" | "ADVANCE">("PAYMENT");
  const [floatVendorPayRemarks, setFloatVendorPayRemarks] = useState("");

  // States for Float Staff Salary Payment
  const [selectedStaffForFloatPay, setSelectedStaffForFloatPay] = useState<string>("");
  const [floatStaffPayAmount, setFloatStaffPayAmount] = useState<number | "">("");
  const [floatStaffPayMode, setFloatStaffPayMode] = useState<PaymentMode>("Cash");
  const [floatStaffPayTxnType, setFloatStaffPayTxnType] = useState<"SALARY_CREDIT" | "ADVANCE_PAYMENT">("ADVANCE_PAYMENT");
  const [floatStaffPayRemarks, setFloatStaffPayRemarks] = useState("");

  // States for Float-to-Float Transfer
  const [targetTransferFloatId, setTargetTransferFloatId] = useState("");
  const [transferAmount, setTransferAmount] = useState<number | "">("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [transferRemarks, setTransferRemarks] = useState("");

  // Form: Open Float Account
  const [disburseStaffUid, setDisburseStaffUid] = useState("");
  const [initialAmount, setInitialAmount] = useState<number | "">("");
  const [disburseDate, setDisburseDate] = useState(new Date().toISOString().split("T")[0]);
  const [disburseMode, setDisburseMode] = useState<PaymentMode>("Bank Transfer - IMPS/RTGS");
  const [disburseFromAccount, setDisburseFromAccount] = useState("");
  const [disburseUpiId, setDisburseUpiId] = useState("");
  const [disburseMobile, setDisburseMobile] = useState("");
  const [disburseBankName, setDisburseBankName] = useState("");
  const [disburseAccNum, setDisburseAccNum] = useState("");
  const [disburseTxnId, setDisburseTxnId] = useState("");
  const [disburseCashDesc, setDisburseCashDesc] = useState("");

  // Form: Top-Up Float
  const [topUpAmount, setTopUpAmount] = useState<number | "">("");
  const [topUpDate, setTopUpDate] = useState(new Date().toISOString().split("T")[0]);
  const [topUpMode, setTopUpMode] = useState<PaymentMode>("UPI");
  const [topUpFromAccount, setTopUpFromAccount] = useState("");
  const [topUpUpiId, setTopUpUpiId] = useState("");
  const [topUpBankName, setTopUpBankName] = useState("");
  const [topUpAccNum, setTopUpAccNum] = useState("");
  const [topUpTxnId, setTopUpTxnId] = useState("");
  const [topUpCashDesc, setTopUpCashDesc] = useState("");
  const [topUpRemarks, setTopUpRemarks] = useState("");

  // Form: Add Expense
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [expenseType, setExpenseType] = useState(expenseTypes[0]);
  const [customExpenseType, setCustomExpenseType] = useState("");
  const [isCreatingExpenseType, setIsCreatingExpenseType] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState<number | "">("");
  const [expenseDetails, setExpenseDetails] = useState("");
  const [expenseWeddings, setExpenseWeddings] = useState<string[]>([]);

  useEffect(() => {
    if (!loading && (!user || !canAccess)) {
      router.push("/handovers");
    }
  }, [user, role, isSuperAdmin, loading, canAccess, router]);

  // Load Data
  const loadInitialData = async () => {
    try {
      setLoadingData(true);

      const floatSnap = await getDocs(
        query(collection(db, "accounting_general_floats"), orderBy("createdAt", "desc"))
      );
      const allFloats = floatSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as GeneralStaffFloat)
      );

      const active = allFloats.filter((f) => f.status === "ACTIVE");
      const settled = allFloats.filter((f) => f.status === "SETTLED");
      setActiveFloats(active);
      setSettledFloats(settled);

      if (!selectedFloat && active.length > 0) {
        setSelectedFloat(active[0]);
      } else if (!selectedFloat && settled.length > 0) {
        setSelectedFloat(settled[0]);
      } else if (selectedFloat) {
        const refreshed = allFloats.find((f) => f.id === selectedFloat.id);
        if (refreshed) setSelectedFloat(refreshed);
      }

      const userSnap = await getDocs(collection(db, "users"));
      setStaffList(userSnap.docs.map((d) => ({ uid: d.id, ...d.data() })));

      const vendorSnap = await getDocs(collection(db, "accounting_vendors")).catch(() => ({ docs: [] }));
      setVendorsList(vendorSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const leadsSnap = await getDocs(collection(db, "leads")).catch(() => ({ docs: [] }));
      const bookedWeddings = leadsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((w) => {
          const status = (w.status || "").toLowerCase();
          return (
            status.includes("booked") ||
            status.includes("deal closed") ||
            status.includes("negotiation")
          );
        })
        .map((w) => ({
          id: w.id,
          title: w.title || w.clientName || `Wedding #${w.id}`,
          resortName: w.resortName || "Resort TBD",
          closedDealAmount: Number(w.closedDealAmount || w.quotation?.finalOfferedPrice || 0),
          advanceBookingAmount: Number(w.advanceBookingAmount || 0),
          receivedPayments: w.receivedPayments || [],
          paymentMilestones: w.quotation?.paymentMilestones || [],
        }));

      setCrmWeddings(bookedWeddings);

      const expTypeSnap = await getDocs(collection(db, "accounting_expense_types")).catch(() => ({ docs: [] }));
      const dynamicTypes = expTypeSnap.docs.map((d) => d.data().name).filter(Boolean);
      if (dynamicTypes.length > 0) {
        setExpenseTypes((prev) => Array.from(new Set([...prev, ...dynamicTypes])));
      }
    } catch (err) {
      console.error("Error loading general credit ledger:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user && canAccess) {
      loadInitialData();
    }
  }, [user, canAccess]);

  // Fetch expenses with in-memory sorting
  const fetchFloatExpenses = async (floatId: string) => {
    try {
      const q = query(
        collection(db, "accounting_general_expenses"),
        where("floatId", "==", floatId)
      );
      const snap = await getDocs(q);
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as GeneralFloatExpense))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setExpenses(list);
    } catch (err) {
      console.error("Error fetching float expenses:", err);
    }
  };

  // Fetch Top-Ups and Internal Transfers safely (Types explicitly cast)
  const fetchFundingHistory = async (floatId: string) => {
    try {
      const q = query(
        collection(db, "accounting_general_topups"),
        where("floatId", "==", floatId)
      );
      const snap = await getDocs(q);
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .sort((a: any, b: any) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
      setFundingHistoryList(list);
    } catch (err) {
      console.error("Error fetching funding history:", err);
    }
  };

  useEffect(() => {
    if (selectedFloat) {
      fetchFloatExpenses(selectedFloat.id);
      fetchFundingHistory(selectedFloat.id);
    }
  }, [selectedFloat?.id]);

  const buildPaymentDetails = (
    mode: PaymentMode,
    fromAcc?: string,
    upi?: string,
    mobile?: string,
    bank?: string,
    acc?: string,
    txn?: string,
    cash?: string
  ): PaymentDetails => {
    const details: PaymentDetails = { mode };

    if (fromAcc && fromAcc.trim()) details.fromAccount = fromAcc.trim();

    if (mode === "UPI") {
      if (upi && upi.trim()) details.upiId = upi.trim();
      if (mobile && mobile.trim()) details.mobileNumber = mobile.trim();
    } else if (mode === "Bank Transfer - IMPS/RTGS") {
      if (bank && bank.trim()) details.toBankName = bank.trim();
      if (acc && acc.trim()) details.toAccountNumber = acc.trim();
      if (txn && txn.trim()) details.transactionId = txn.trim();
    } else if (mode === "Cash") {
      if (cash && cash.trim()) details.cashDescription = cash.trim();
    }

    return details;
  };

  // Handler: Transfer Float Balance from One Staff to Another
  const handleTransferFloat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageFloats || !user || !selectedFloat || !targetTransferFloatId || !transferAmount) return;

    const parsedAmount = Number(transferAmount);

    if (parsedAmount <= 0) {
      alert("Transfer amount must be greater than zero.");
      return;
    }

    if (parsedAmount > selectedFloat.currentFloatBalance) {
      alert(`Insufficient float balance! ${selectedFloat.staffName} only has ₹${selectedFloat.currentFloatBalance.toLocaleString()} available.`);
      return;
    }

    const targetFloat = activeFloats.find((f) => f.id === targetTransferFloatId);
    if (!targetFloat) {
      alert("Target staff float not found.");
      return;
    }

    try {
      // 1. Deduct from Source Float
      const sourceNewBalance = selectedFloat.currentFloatBalance - parsedAmount;
      const sourceNewTopUps = (selectedFloat.totalTopUpAmount || 0) - parsedAmount;
      await updateDoc(doc(db, "accounting_general_floats", selectedFloat.id), {
        currentFloatBalance: sourceNewBalance,
        totalTopUpAmount: sourceNewTopUps,
        updatedAt: new Date().toISOString(),
      });

      // 2. Add to Destination Float
      const targetNewBalance = targetFloat.currentFloatBalance + parsedAmount;
      const targetNewTopUps = (targetFloat.totalTopUpAmount || 0) + parsedAmount;
      await updateDoc(doc(db, "accounting_general_floats", targetFloat.id), {
        currentFloatBalance: targetNewBalance,
        totalTopUpAmount: targetNewTopUps,
        updatedAt: new Date().toISOString(),
      });

      // 3. Log Outgoing Transfer Record for Source
      await addDoc(collection(db, "accounting_general_topups"), {
        floatId: selectedFloat.id,
        type: "TRANSFER_OUT",
        amount: -parsedAmount,
        date: transferDate,
        paymentDetails: { mode: "Staff Float Transfer" },
        remarks: `Transferred to ${targetFloat.staffName}: ${transferRemarks.trim() || "No remarks"}`,
        relatedStaffName: targetFloat.staffName,
        createdAt: new Date().toISOString(),
        createdByUid: user.uid,
        createdByEmail: user.email || "Unknown",
      });

      // 4. Log Incoming Transfer Record for Target
      await addDoc(collection(db, "accounting_general_topups"), {
        floatId: targetFloat.id,
        type: "TRANSFER_IN",
        amount: parsedAmount,
        date: transferDate,
        paymentDetails: { mode: "Staff Float Transfer" },
        remarks: `Received from ${selectedFloat.staffName}: ${transferRemarks.trim() || "No remarks"}`,
        relatedStaffName: selectedFloat.staffName,
        createdAt: new Date().toISOString(),
        createdByUid: user.uid,
        createdByEmail: user.email || "Unknown",
      });

      // Valid action "UPDATE" to satisfy TypeScript audit log constraints
      await recordAuditLog(user, {
        module: "GENERAL_LEDGER",
        action: "UPDATE",
        targetId: selectedFloat.id,
        targetName: selectedFloat.staffName,
        notes: `[TRANSFER] Transferred ₹${parsedAmount} cash float from ${selectedFloat.staffName} to ${targetFloat.staffName}.`,
      });

      setShowTransferFloatModal(false);
      setTransferAmount("");
      setTransferRemarks("");
      setTargetTransferFloatId("");

      await loadInitialData();
      alert(`✅ ₹${parsedAmount.toLocaleString()} successfully transferred from ${selectedFloat.staffName} to ${targetFloat.staffName}.`);
    } catch (err: any) {
      console.error(err);
      alert("Float transfer failed: " + err.message);
    }
  };

  // Handler: Record Vendor Payment from Float
  const handleRecordVendorPayFromFloat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageFloats || !user || !selectedFloat || !selectedVendorForFloatPay || !floatVendorPayAmount) return;

    const parsedAmount = Number(floatVendorPayAmount);

    try {
      const expenseData = {
        floatId: selectedFloat.id,
        staffUid: selectedFloat.staffUid,
        purchaseType: `Vendor Payout (${selectedVendorForFloatPay.vendorName})`,
        amount: parsedAmount,
        date: new Date().toISOString().split("T")[0],
        purchaseDetails: `Vendor payment disbursed on-site to ${selectedVendorForFloatPay.vendorName}. Remarks: ${floatVendorPayRemarks || "None"}`,
        paidFromFloat: true,
        vendorId: selectedVendorForFloatPay.id,
        createdAt: new Date().toISOString(),
        createdByUid: user.uid,
      };
      await addDoc(collection(db, "accounting_general_expenses"), expenseData);

      const updatedSpent = selectedFloat.totalSpentAmount + parsedAmount;
      const updatedBalance = selectedFloat.currentFloatBalance - parsedAmount;
      await updateDoc(doc(db, "accounting_general_floats", selectedFloat.id), {
        totalSpentAmount: updatedSpent,
        currentFloatBalance: updatedBalance,
        updatedAt: new Date().toISOString(),
      });

      const vendorTxnData = {
        vendorId: selectedVendorForFloatPay.id,
        vendorName: selectedVendorForFloatPay.vendorName,
        type: floatVendorPayTxnType,
        amount: parsedAmount,
        date: new Date().toISOString().split("T")[0],
        paymentDetails: { mode: floatVendorPayMode, cashDescription: `Paid on-ground from ${selectedFloat.staffName}'s float` },
        paidFromFloat: true,
        floatId: selectedFloat.id,
        remarks: `Paid from ${selectedFloat.staffName}'s float: ${floatVendorPayRemarks}`,
        createdAt: new Date().toISOString(),
        createdByUid: user.uid,
        createdByEmail: user.email || "Unknown",
      };
      await addDoc(collection(db, "accounting_vendor_transactions"), vendorTxnData);

      const updatedVendorBalance = selectedVendorForFloatPay.currentBalance - parsedAmount;
      const updatedVendorPaid = selectedVendorForFloatPay.totalPaid + parsedAmount;
      await updateDoc(doc(db, "accounting_vendors", selectedVendorForFloatPay.id), {
        currentBalance: updatedVendorBalance,
        totalPaid: updatedVendorPaid,
        updatedAt: new Date().toISOString(),
      });

      setSelectedFloat({ ...selectedFloat, totalSpentAmount: updatedSpent, currentFloatBalance: updatedBalance });
      setShowFloatVendorPayModal(false);
      setFloatVendorPayAmount("");
      setFloatVendorPayRemarks("");
      fetchFloatExpenses(selectedFloat.id);
      alert(`✅ ₹${parsedAmount} disbursed to ${selectedVendorForFloatPay.vendorName} and deducted from float.`);
    } catch (err: any) {
      alert("Failed: " + err.message);
    }
  };

  // Handler: Record Staff Salary/Advance Payment from Float
  const handleRecordStaffPayFromFloat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageFloats || !user || !selectedFloat || !selectedStaffForFloatPay || !floatStaffPayAmount) return;

    const parsedAmount = Number(floatStaffPayAmount);
    const targetStaff = staffList.find((s) => s.uid === selectedStaffForFloatPay);
    const targetStaffName = targetStaff?.displayName || targetStaff?.email || "Staff";

    try {
      const expenseData = {
        floatId: selectedFloat.id,
        staffUid: selectedFloat.staffUid,
        purchaseType: `Staff Advance/Salary (${targetStaffName})`,
        amount: parsedAmount,
        date: new Date().toISOString().split("T")[0],
        purchaseDetails: `Staff payment given to ${targetStaffName} from field float.`,
        paidFromFloat: true,
        targetStaffUid: selectedStaffForFloatPay,
        createdAt: new Date().toISOString(),
        createdByUid: user.uid,
      };
      await addDoc(collection(db, "accounting_general_expenses"), expenseData);

      const updatedSpent = selectedFloat.totalSpentAmount + parsedAmount;
      const updatedBalance = selectedFloat.currentFloatBalance - parsedAmount;
      await updateDoc(doc(db, "accounting_general_floats", selectedFloat.id), {
        totalSpentAmount: updatedSpent,
        currentFloatBalance: updatedBalance,
        updatedAt: new Date().toISOString(),
      });

      const staffTxnData = {
        staffUid: selectedStaffForFloatPay,
        type: floatStaffPayTxnType,
        amount: parsedAmount,
        date: new Date().toISOString().split("T")[0],
        paymentDetails: { mode: floatStaffPayMode, cashDescription: `Given on-ground from ${selectedFloat.staffName}'s float` },
        paidFromFloat: true,
        floatId: selectedFloat.id,
        remarks: `Disbursed by ${selectedFloat.staffName} from float: ${floatStaffPayRemarks}`,
        createdAt: new Date().toISOString(),
        createdByUid: user.uid,
        createdByEmail: user.email || "Unknown",
      };
      await addDoc(collection(db, "accounting_staff_transactions"), staffTxnData);

      setSelectedFloat({ ...selectedFloat, totalSpentAmount: updatedSpent, currentFloatBalance: updatedBalance });
      setShowFloatStaffPayModal(false);
      setFloatStaffPayAmount("");
      setFloatStaffPayRemarks("");
      fetchFloatExpenses(selectedFloat.id);
      alert(`✅ ₹${parsedAmount} given to ${targetStaffName} and deducted from float.`);
    } catch (err: any) {
      alert("Failed: " + err.message);
    }
  };

  // Submit 1: Open Temporary Staff Float
  const handleOpenFloat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageFloats || !user || !disburseStaffUid || !initialAmount) return;

    const chosenStaff = staffList.find((s) => s.uid === disburseStaffUid);
    const parsedAmount = Number(initialAmount);

    const paymentDetails = buildPaymentDetails(
      disburseMode,
      disburseFromAccount,
      disburseUpiId,
      disburseMobile,
      disburseBankName,
      disburseAccNum,
      disburseTxnId,
      disburseCashDesc
    );

    try {
      const floatRef = doc(collection(db, "accounting_general_floats"));
      const newFloat: GeneralStaffFloat = {
        id: floatRef.id,
        staffUid: disburseStaffUid,
        staffName: chosenStaff?.displayName || chosenStaff?.email || "Staff",
        status: "ACTIVE",
        initialDisbursedAmount: parsedAmount,
        totalTopUpAmount: 0,
        totalSpentAmount: 0,
        currentFloatBalance: parsedAmount,
        disbursementPaymentDetails: paymentDetails,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUid: user?.uid || "",
      };

      await setDoc(floatRef, newFloat);

      await recordAuditLog(user, {
        module: "GENERAL_LEDGER",
        action: "DISBURSE",
        targetId: floatRef.id,
        targetName: `Float for ${newFloat.staffName}`,
        newData: newFloat,
        notes: `Disbursed initial float of ₹${parsedAmount} to ${newFloat.staffName} via ${disburseMode}`,
      });

      setShowOpenFloatModal(false);
      setDisburseStaffUid("");
      setInitialAmount("");
      setDisburseFromAccount("");
      setDisburseUpiId("");
      setDisburseMobile("");
      setDisburseBankName("");
      setDisburseAccNum("");
      setDisburseTxnId("");
      setDisburseCashDesc("");

      await loadInitialData();
      setSelectedFloat(newFloat);
      alert(`✅ Temporary Float Account established for ${newFloat.staffName}.`);
    } catch (err: any) {
      console.error(err);
      alert("Failed to initialize staff float: " + err.message);
    }
  };

  // Submit 2: Top-Up Active Float
  const handleTopUpFloat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageFloats || !user || !selectedFloat || !topUpAmount) return;

    const parsedAmount = Number(topUpAmount);
    const topUpPaymentDetails = buildPaymentDetails(
      topUpMode,
      topUpFromAccount,
      topUpUpiId,
      undefined,
      topUpBankName,
      topUpAccNum,
      topUpTxnId,
      topUpCashDesc
    );

    try {
      const updatedTopUpTotal = selectedFloat.totalTopUpAmount + parsedAmount;
      const updatedBalance = selectedFloat.currentFloatBalance + parsedAmount;

      const updatePayload = {
        totalTopUpAmount: updatedTopUpTotal,
        currentFloatBalance: updatedBalance,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, "accounting_general_floats", selectedFloat.id), updatePayload);

      const topupRecord: any = {
        floatId: selectedFloat.id,
        amount: parsedAmount,
        date: topUpDate,
        paymentDetails: topUpPaymentDetails,
        createdAt: new Date().toISOString(),
        createdByUid: user?.uid || "",
        createdByEmail: user?.email || "Unknown",
      };
      if (topUpRemarks.trim()) {
        topupRecord.remarks = topUpRemarks.trim();
      }

      await addDoc(collection(db, "accounting_general_topups"), topupRecord);

      await recordAuditLog(user, {
        module: "GENERAL_LEDGER",
        action: "TOP_UP",
        targetId: selectedFloat.id,
        targetName: selectedFloat.staffName,
        previousData: {
          balance: selectedFloat.currentFloatBalance,
          topUpTotal: selectedFloat.totalTopUpAmount,
        },
        newData: {
          ...updatePayload,
          topUpAmount: parsedAmount,
          paymentDetails: topUpPaymentDetails,
        },
        notes: `Topped up float with ₹${parsedAmount} via ${topUpMode}`,
      });

      const updated = { ...selectedFloat, ...updatePayload };
      setSelectedFloat(updated);
      setActiveFloats((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));

      setShowTopUpModal(false);
      setTopUpAmount("");
      setTopUpRemarks("");
      setTopUpTxnId("");
      setTopUpCashDesc("");
      fetchFundingHistory(selectedFloat.id);
      alert("✅ Float account successfully topped up.");
    } catch (err: any) {
      console.error(err);
      alert("Failed to top-up float: " + err.message);
    }
  };

  // Submit 3: Log Field Expense
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageFloats || !user || !selectedFloat || !expenseAmount || !expenseDetails) return;

    const parsedAmount = Number(expenseAmount);
    const chosenType = isCreatingExpenseType ? customExpenseType.trim() : expenseType;

    try {
      if (isCreatingExpenseType && customExpenseType.trim()) {
        await addDoc(collection(db, "accounting_expense_types"), {
          name: customExpenseType.trim(),
          createdAt: new Date().toISOString(),
        });
        setExpenseTypes((prev) => [...prev, customExpenseType.trim()]);
      }

      const linkedWeddingNames = crmWeddings
        .filter((w) => expenseWeddings.includes(w.id))
        .map((w) => w.title || w.clientName || `Wedding #${w.id}`);

      const expenseData: any = {
        floatId: selectedFloat.id,
        staffUid: selectedFloat.staffUid,
        purchaseType: chosenType,
        amount: parsedAmount,
        date: expenseDate,
        purchaseDetails: expenseDetails.trim(),
        linkedWeddingIds: expenseWeddings.length > 0 ? expenseWeddings : [],
        linkedWeddingNames: linkedWeddingNames,
        createdAt: new Date().toISOString(),
        createdByUid: user?.uid || "",
      };

      await addDoc(collection(db, "accounting_general_expenses"), expenseData);

      const updatedSpent = selectedFloat.totalSpentAmount + parsedAmount;
      const updatedBalance = selectedFloat.currentFloatBalance - parsedAmount;

      const updatePayload = {
        totalSpentAmount: updatedSpent,
        currentFloatBalance: updatedBalance,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, "accounting_general_floats", selectedFloat.id), updatePayload);

      await recordAuditLog(user, {
        module: "GENERAL_LEDGER",
        action: "CREATE",
        targetId: selectedFloat.id,
        targetName: selectedFloat.staffName,
        newData: {
          ...updatePayload,
          expense: expenseData,
        },
        notes: `Logged ₹${parsedAmount} expense for ${chosenType} (${expenseDetails})`,
      });

      const updated = { ...selectedFloat, ...updatePayload };
      setSelectedFloat(updated);
      setActiveFloats((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));

      setShowAddExpenseModal(false);
      setExpenseAmount("");
      setExpenseDetails("");
      setExpenseWeddings([]);
      setIsCreatingExpenseType(false);
      setCustomExpenseType("");
      fetchFloatExpenses(selectedFloat.id);
      alert("✅ Expense logged against staff float.");
    } catch (err: any) {
      console.error(err);
      alert("Failed to log expense: " + err.message);
    }
  };

  // Submit 4: Settle & Close Float
  const handleSettleFloat = async () => {
    if (!canManageFloats || !user || !selectedFloat) return;

    const totalDisbursed = selectedFloat.initialDisbursedAmount + (selectedFloat.totalTopUpAmount || 0);
    const totalSpent = selectedFloat.totalSpentAmount || 0;
    const difference = totalDisbursed - totalSpent; 

    let confirmationMsg = `Settle Float Account for ${selectedFloat.staffName}?\n`;
    confirmationMsg += `Total Disbursed: ₹${totalDisbursed}\n`;
    confirmationMsg += `Total Spent: ₹${totalSpent}\n`;

    if (difference > 0) {
      confirmationMsg += `\n💡 SURPLUS: Staff holds unspent ₹${difference}. This will be REVERSED back to the company account.`;
    } else if (difference < 0) {
      confirmationMsg += `\n💡 DEFICIT: Staff spent ₹${Math.abs(difference)} extra out-of-pocket. This will be REIMBURSED to the staff.`;
    } else {
      confirmationMsg += `\n💡 BALANCED: Zero variance.`;
    }

    if (!window.confirm(confirmationMsg)) return;

    try {
      let updatedTopUps = selectedFloat.totalTopUpAmount || 0;
      let auditNotes = `Settled float with balanced zero variance.`;

      if (difference < 0) {
        const extraDeficit = Math.abs(difference);
        updatedTopUps += extraDeficit;

        await addDoc(collection(db, "accounting_general_topups"), {
          floatId: selectedFloat.id,
          amount: extraDeficit,
          date: new Date().toISOString().split("T")[0],
          paymentDetails: { mode: "Bank Transfer - IMPS/RTGS", cashDescription: "Automatic Settlement Deficit Reimbursement" },
          remarks: "Auto-reimbursement for out-of-pocket staff overspend during settlement",
          createdAt: new Date().toISOString(),
          createdByUid: user.uid,
          createdByEmail: user.email,
        });

        auditNotes = `Settled float. Automatically reimbursed out-of-pocket deficit of ₹${extraDeficit} to staff. Balance brought to 0.`;
      } else if (difference > 0) {
        await addDoc(collection(db, "accounting_general_topups"), {
          floatId: selectedFloat.id,
          amount: -difference,
          date: new Date().toISOString().split("T")[0],
          paymentDetails: { mode: "Cash", cashDescription: "Automatic Settlement Cash Surplus Reversal" },
          remarks: "Cash surplus returned to company treasury upon float settlement",
          createdAt: new Date().toISOString(),
          createdByUid: user.uid,
          createdByEmail: user.email,
        });

        auditNotes = `Settled float. Automatically reversed unspent surplus of ₹${difference} back to company treasury. Balance brought to 0.`;
      }

      const updatePayload = {
        status: "SETTLED" as const,
        totalTopUpAmount: updatedTopUps,
        currentFloatBalance: 0,
        settledAt: new Date().toISOString(),
        settledByUid: user.uid,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, "accounting_general_floats", selectedFloat.id), updatePayload);

      await recordAuditLog(user, {
        module: "GENERAL_LEDGER",
        action: "SETTLE",
        targetId: selectedFloat.id,
        targetName: selectedFloat.staffName,
        previousData: { status: "ACTIVE", balance: selectedFloat.currentFloatBalance },
        newData: updatePayload,
        notes: auditNotes,
      });

      await loadInitialData();
      alert("✅ Float Account has been mathematically reconciled, adjusted, and settled.");
    } catch (err: any) {
      console.error(err);
      alert("Settlement failed: " + err.message);
    }
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center font-mono text-xs uppercase tracking-widest text-neutral-600">
        LOADING GENERAL CREDIT LEDGER & PETTY FLOATS...
      </div>
    );
  }

  const currentFloatsList = filterStatus === "ACTIVE" ? activeFloats : settledFloats;

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-neutral-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        <div className="mb-4">
          <button
            onClick={() => router.push("/accounting")}
            className="text-xs font-bold text-gray-700 hover:text-black flex items-center gap-1 bg-white border border-gray-300 px-3.5 py-1.5 rounded-lg shadow-sm transition"
          >
            ← Back to Accounting Dashboard
          </button>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-neutral-300 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-neutral-950 rounded-full animate-pulse" />
              <p className="text-[10px] uppercase font-mono font-black tracking-widest text-neutral-500">
                BRAJWAL ERP / GENERAL & PETTY EXPENSES
              </p>
              {isReadOnlyViewer && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold border border-blue-200">
                  AUDITOR / READ-ONLY
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-neutral-950 mt-1">
              General Credit Ledger & Staff Floats
            </h1>
          </div>
           
          {canManageFloats && (
            <button
              onClick={() => setShowOpenFloatModal(true)}
              className="px-5 py-2.5 rounded-lg font-black text-xs uppercase tracking-wider bg-neutral-900 text-white hover:bg-neutral-800 transition shadow-[4px_4px_10px_rgba(0,0,0,0.15)] active:translate-y-0.5"
            >
              + Disburse Staff Float
            </button>
          )}
        </div>

        {/* Master Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Floats List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-xl p-4 border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff]">
              <div className="flex gap-2 p-1 bg-neutral-100 rounded-lg mb-3">
                <button
                  onClick={() => setFilterStatus("ACTIVE")}
                  className={`flex-1 py-1.5 text-center font-mono text-xs font-black uppercase rounded-md transition ${
                    filterStatus === "ACTIVE" ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"
                  }`}
                >
                  Active Floats ({activeFloats.length})
                </button>
                <button
                  onClick={() => setFilterStatus("SETTLED")}
                  className={`flex-1 py-1.5 text-center font-mono text-xs font-black uppercase rounded-md transition ${
                    filterStatus === "SETTLED" ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"
                  }`}
                >
                  Settled ({settledFloats.length})
                </button>
              </div>

              {currentFloatsList.length === 0 ? (
                <div className="text-center py-8 text-xs font-mono text-neutral-400">
                  NO {filterStatus} FLOATS RECORDED.
                </div>
              ) : (
                <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                  {currentFloatsList.map((f) => {
                    const isSelected = selectedFloat?.id === f.id;
                    const isDeficit = f.currentFloatBalance < 0;
                    return (
                      <div
                        key={f.id}
                        onClick={() => setSelectedFloat(f)}
                        className={`p-4 rounded-xl cursor-pointer transition border ${
                          isSelected
                            ? "bg-neutral-950 text-white border-neutral-950 shadow-inner"
                            : "bg-white text-neutral-900 border-neutral-200 hover:border-neutral-400 shadow-sm"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-black text-sm tracking-tight">{f.staffName}</p>
                            <span
                              className={`inline-block mt-1 text-[9px] font-mono px-2 py-0.5 rounded font-black border ${
                                f.status === "ACTIVE"
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                  : "bg-neutral-200 text-neutral-700 border-neutral-300"
                              }`}
                            >
                              {f.status}
                            </span>
                          </div>
                          <div className="text-right font-mono">
                            <p className="text-[10px] uppercase text-neutral-400">Float Balance</p>
                            <p
                              className={`text-sm font-black ${
                                isDeficit
                                  ? "text-rose-500"
                                  : f.currentFloatBalance === 0
                                  ? "text-neutral-400"
                                  : isSelected
                                  ? "text-emerald-400"
                                  : "text-emerald-600"
                              }`}
                            >
                              ₹{f.currentFloatBalance.toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 pt-2 border-t border-neutral-200/20 flex justify-between text-[11px] font-mono text-neutral-400">
                          <span>Disbursed: ₹{f.initialDisbursedAmount + f.totalTopUpAmount}</span>
                          <span>Spent: ₹{f.totalSpentAmount}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Selected Float Ledger */}
          <div className="lg:col-span-8 space-y-6">
            {selectedFloat ? (
              <>
                <div className="bg-white rounded-xl p-6 border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-neutral-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-black font-mono text-neutral-950">
                          {selectedFloat.staffName}&apos;s Field Float
                        </h2>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                            selectedFloat.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : "bg-neutral-100 text-neutral-700 border-neutral-300"
                          }`}
                        >
                          {selectedFloat.status}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 font-mono mt-1">
                        Disbursed via:{" "}
                        <strong className="text-neutral-800">
                          {selectedFloat.disbursementPaymentDetails.mode}
                        </strong>{" "}
                        · Created on:{" "}
                        <strong className="text-neutral-800">
                          {new Date(selectedFloat.createdAt).toLocaleDateString()}
                        </strong>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 font-mono">
                      {/* Funding History viewable by all authorized viewers */}
                      <button
                        onClick={() => setShowFundingHistoryModal(true)}
                        className="px-3 py-2 bg-white border border-neutral-300 text-neutral-800 rounded-lg text-xs font-black uppercase hover:bg-neutral-100 transition shadow-sm"
                      >
                        📜 Funding & Top-Up History
                      </button>

                      {selectedFloat.status === "ACTIVE" && canManageFloats && (
                        <>
                          <button
                            onClick={() => setShowTransferFloatModal(true)}
                            className="px-3 py-2 bg-teal-700 text-white rounded-lg text-xs font-black uppercase hover:bg-teal-800 transition shadow-sm"
                          >
                            ⇄ Transfer Float
                          </button>
                          <button
                            onClick={() => setShowTopUpModal(true)}
                            className="px-3 py-2 bg-neutral-900 text-white rounded-lg text-xs font-black uppercase hover:bg-neutral-800 transition"
                          >
                            + Top-Up
                          </button>
                          <button
                            onClick={() => handleSettleFloat()}
                            className="px-3 py-2 border border-neutral-400 text-neutral-900 rounded-lg text-xs font-black uppercase hover:bg-neutral-100 transition"
                          >
                            ✓ Settle
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 font-mono">
                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
                      <p className="text-[10px] uppercase font-black tracking-widest text-neutral-400">
                        Initial Disbursed
                      </p>
                      <p className="text-lg font-black text-neutral-900 mt-1">
                        ₹{selectedFloat.initialDisbursedAmount.toLocaleString()}
                      </p>
                    </div>

                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
                      <p className="text-[10px] uppercase font-black tracking-widest text-neutral-400">
                        Total Top-Ups / Received
                      </p>
                      <p className="text-lg font-black text-neutral-900 mt-1">
                        ₹{selectedFloat.totalTopUpAmount.toLocaleString()}
                      </p>
                    </div>

                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
                      <p className="text-[10px] uppercase font-black tracking-widest text-neutral-400">
                        Total Spent
                      </p>
                      <p className="text-lg font-black text-rose-600 mt-1">
                        ₹{selectedFloat.totalSpentAmount.toLocaleString()}
                      </p>
                    </div>

                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
                      <p className="text-[10px] uppercase font-black tracking-widest text-neutral-400">
                        Remaining Float
                      </p>
                      <p
                        className={`text-lg font-black mt-1 ${
                          selectedFloat.currentFloatBalance < 0
                            ? "text-rose-600"
                            : selectedFloat.currentFloatBalance === 0
                            ? "text-neutral-500"
                            : "text-emerald-600"
                        }`}
                      >
                        ₹{selectedFloat.currentFloatBalance.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Expenses Log Container */}
                <div className="bg-white rounded-xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] overflow-hidden">
                  <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-neutral-50">
                    <div>
                      <h3 className="text-xs font-mono font-black uppercase tracking-wider text-neutral-900">
                        Field Purchases & Bills ({expenses.length})
                      </h3>
                      <p className="text-[11px] text-neutral-500 font-mono">
                        Stay, Fuel, Food & Local Supplies
                      </p>
                    </div>

                    {selectedFloat.status === "ACTIVE" && canManageFloats && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setShowAddExpenseModal(true)}
                          className="px-3.5 py-2 rounded-lg font-mono text-xs font-black uppercase bg-neutral-950 text-white hover:bg-neutral-800 transition"
                        >
                          + 1. Log General Expense
                        </button>
                        <button
                          onClick={() => setShowFloatVendorPayModal(true)}
                          className="px-3.5 py-2 rounded-lg font-mono text-xs font-black uppercase bg-blue-700 text-white hover:bg-blue-800 transition"
                        >
                          + 2. Pay Vendor from Float
                        </button>
                        <button
                          onClick={() => setShowFloatStaffPayModal(true)}
                          className="px-3.5 py-2 rounded-lg font-mono text-xs font-black uppercase bg-purple-700 text-white hover:bg-purple-800 transition"
                        >
                          + 3. Pay Staff Salary from Float
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-medium font-mono">
                      <thead className="bg-white border-b border-neutral-200 text-neutral-400 text-[10px] uppercase">
                        <tr>
                          <th className="p-3.5">Date</th>
                          <th className="p-3.5">Category</th>
                          <th className="p-3.5">Amount</th>
                          <th className="p-3.5">Details</th>
                          <th className="p-3.5">Weddings</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {expenses.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-neutral-400 text-xs">
                              NO EXPENSES FILED AGAINST THIS FLOAT YET.
                            </td>
                          </tr>
                        ) : (
                          expenses.map((exp) => {
                            const matchedWeddings = 
                              (exp as any).linkedWeddingNames && (exp as any).linkedWeddingNames.length > 0
                                ? (exp as any).linkedWeddingNames
                                : crmWeddings
                                    .filter((w) => exp.linkedWeddingIds?.includes(w.id))
                                    .map((w) => w.title || w.clientName);

                            return (
                              <tr key={exp.id} className="hover:bg-neutral-50/80 transition">
                                <td className="p-3.5 font-bold whitespace-nowrap">{exp.date}</td>
                                <td className="p-3.5 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black border border-neutral-300 bg-neutral-100 text-neutral-800">
                                    {exp.purchaseType}
                                  </span>
                                </td>
                                <td className="p-3.5 font-black text-sm whitespace-nowrap text-neutral-950">
                                  ₹{exp.amount.toLocaleString()}
                                </td>
                                <td className="p-3.5 max-w-sm text-neutral-700">{exp.purchaseDetails}</td>
                                <td className="p-3.5 max-w-xs">
                                  {matchedWeddings.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {matchedWeddings.map((m: any, i: number) => (
                                        <span
                                          key={i}
                                          className="text-[9px] bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200"
                                        >
                                          💍 {m}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-neutral-400">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl p-12 text-center border border-neutral-200 text-neutral-400 font-mono text-xs">
                SELECT A TEMPORARY FLOAT ACCOUNT FROM THE LIST TO MONITOR PETTY DISBURSEMENTS.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal 1: Open Temporary Staff Float */}
      {showOpenFloatModal && canManageFloats && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-neutral-300 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-mono text-xs">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <h2 className="text-base font-black uppercase text-neutral-950">
                Disburse Temporary Float
              </h2>
              <button onClick={() => setShowOpenFloatModal(false)} className="text-neutral-400 hover:text-black font-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleOpenFloat} className="space-y-4">
              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Choose Staff Member *</label>
                <select
                  required
                  value={disburseStaffUid}
                  onChange={(e) => setDisburseStaffUid(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                >
                  <option value="">-- Choose Staff --</option>
                  {staffList.map((s) => (
                    <option key={s.uid} value={s.uid}>
                      {s.displayName || s.email} ({s.role?.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Initial Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 20000"
                    value={initialAmount}
                    onChange={(e) => setInitialAmount(Number(e.target.value))}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Disbursal Date *</label>
                  <input
                    type="date"
                    required
                    value={disburseDate}
                    onChange={(e) => setDisburseDate(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Mode of Payment *</label>
                <select
                  value={disburseMode}
                  onChange={(e) => setDisburseMode(e.target.value as PaymentMode)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                >
                  <option value="Bank Transfer - IMPS/RTGS">3 - Bank Transfer - IMPS/RTGS</option>
                  <option value="UPI">2 - UPI</option>
                  <option value="Cash">1 - Cash</option>
                </select>
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Debited From Company A/C</label>
                <input
                  placeholder="e.g. HDFC Current #00129"
                  value={disburseFromAccount}
                  onChange={(e) => setDisburseFromAccount(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 outline-none"
                />
              </div>

              {/* Conditional UPI */}
              {disburseMode === "UPI" && (
                <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-300 space-y-2">
                  <span className="block font-black uppercase text-neutral-600">UPI Payment Specifics</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="Target UPI ID"
                      value={disburseUpiId}
                      onChange={(e) => setDisburseUpiId(e.target.value)}
                      className="border border-neutral-300 p-2 rounded bg-white text-neutral-950"
                    />
                    <input
                      placeholder="Target Mobile No"
                      value={disburseMobile}
                      onChange={(e) => setDisburseMobile(e.target.value)}
                      className="border border-neutral-300 p-2 rounded bg-white text-neutral-950"
                    />
                  </div>
                </div>
              )}

              {/* Conditional Bank Transfer */}
              {disburseMode === "Bank Transfer - IMPS/RTGS" && (
                <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-300 space-y-2">
                  <span className="block font-black uppercase text-neutral-600">Bank Transfer Details</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      required
                      placeholder="Bank Name"
                      value={disburseBankName}
                      onChange={(e) => setDisburseBankName(e.target.value)}
                      className="border border-neutral-300 p-2 rounded bg-white text-neutral-950"
                    />
                    <input
                      required
                      placeholder="A/C Number"
                      value={disburseAccNum}
                      onChange={(e) => setDisburseAccNum(e.target.value)}
                      className="border border-neutral-300 p-2 rounded bg-white text-neutral-950"
                    />
                  </div>
                  <input
                    required
                    placeholder="Transaction ID / UTR"
                    value={disburseTxnId}
                    onChange={(e) => setDisburseTxnId(e.target.value)}
                    className="w-full border border-neutral-300 p-2 rounded bg-white text-neutral-950"
                  />
                </div>
              )}

              {/* Conditional Cash */}
              {disburseMode === "Cash" && (
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Description of Cash *</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="e.g. Physical cash handed over at destination..."
                    value={disburseCashDesc}
                    onChange={(e) => setDisburseCashDesc(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowOpenFloatModal(false)}
                  className="px-4 py-2 border border-neutral-300 font-bold rounded-lg uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-neutral-950 text-white font-black rounded-lg uppercase hover:bg-neutral-800 transition"
                >
                  Open Float & Disburse
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Top-Up Active Float */}
      {showTopUpModal && canManageFloats && selectedFloat && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-neutral-300 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-mono text-xs">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <div>
                <h2 className="text-base font-black uppercase text-neutral-950">Top-Up Staff Float</h2>
                <p className="text-[11px] text-neutral-500">Beneficiary: {selectedFloat.staffName}</p>
              </div>
              <button onClick={() => setShowTopUpModal(false)} className="text-neutral-400 hover:text-black font-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleTopUpFloat} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Top-Up Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 10000"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(Number(e.target.value))}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Date *</label>
                  <input
                    type="date"
                    required
                    value={topUpDate}
                    onChange={(e) => setTopUpDate(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Mode of Payment *</label>
                <select
                  value={topUpMode}
                  onChange={(e) => setTopUpMode(e.target.value as PaymentMode)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                >
                  <option value="UPI">2 - UPI</option>
                  <option value="Bank Transfer - IMPS/RTGS">3 - Bank Transfer - IMPS/RTGS</option>
                  <option value="Cash">1 - Cash</option>
                </select>
              </div>

              {topUpMode === "UPI" && (
                <div>
                  <label className="block text-[10px] font-bold text-neutral-700 mb-1">Target UPI ID</label>
                  <input
                    placeholder="e.g. staff@okicici"
                    value={topUpUpiId}
                    onChange={(e) => setTopUpUpiId(e.target.value)}
                    className="w-full border border-neutral-300 p-2 rounded bg-neutral-50 focus:bg-white text-neutral-950"
                  />
                </div>
              )}

              {topUpMode === "Bank Transfer - IMPS/RTGS" && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Bank Name"
                    value={topUpBankName}
                    onChange={(e) => setTopUpBankName(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-neutral-50 focus:bg-white"
                  />
                  <input
                    placeholder="Transaction ID / UTR"
                    value={topUpTxnId}
                    onChange={(e) => setTopUpTxnId(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-neutral-50 focus:bg-white"
                  />
                </div>
              )}

              {topUpMode === "Cash" && (
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Description of Cash *</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Physical cash given..."
                    value={topUpCashDesc}
                    onChange={(e) => setTopUpCashDesc(e.target.value)}
                    className="w-full border border-neutral-300 p-2 rounded bg-neutral-50 focus:bg-white"
                  />
                </div>
              )}

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Top-Up Reason / Remarks</label>
                <input
                  placeholder="e.g. Extra diesel and resort deposit"
                  value={topUpRemarks}
                  onChange={(e) => setTopUpRemarks(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowTopUpModal(false)}
                  className="px-4 py-2 border border-neutral-300 font-bold rounded-lg uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-neutral-950 text-white font-black rounded-lg uppercase hover:bg-neutral-800 transition"
                >
                  Disburse Top-Up
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Log Field Expense */}
      {showAddExpenseModal && canManageFloats && selectedFloat && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 border border-neutral-300 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-mono text-xs">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <div>
                <h2 className="text-base font-black uppercase text-neutral-950">Log Field Expense</h2>
                <p className="text-[11px] text-neutral-500">Staff: {selectedFloat.staffName}</p>
              </div>
              <button onClick={() => setShowAddExpenseModal(false)} className="text-neutral-400 hover:text-black font-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Date Of Expense *</label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Amount Spent (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 4200"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(Number(e.target.value))}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Type of Purchase *</label>
                {!isCreatingExpenseType ? (
                  <div className="flex gap-2">
                    <select
                      value={expenseType}
                      onChange={(e) => setExpenseType(e.target.value)}
                      className="flex-1 border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                    >
                      {expenseTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setIsCreatingExpenseType(true)}
                      className="px-3 py-2 border border-neutral-300 rounded-lg font-black hover:bg-neutral-100 uppercase text-[10px]"
                    >
                      + New
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      placeholder="Type custom category..."
                      value={customExpenseType}
                      onChange={(e) => setCustomExpenseType(e.target.value)}
                      className="flex-1 border border-neutral-300 p-2.5 rounded-lg bg-white font-bold outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setIsCreatingExpenseType(false)}
                      className="px-3 py-2 bg-neutral-200 rounded-lg font-black text-[10px] uppercase"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">
                  Purchase Details (Resort, Fuel, Fastag, etc.) *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Fastag toll recharge #9921, Diesel receipt at IndianOil Bunk..."
                  value={expenseDetails}
                  onChange={(e) => setExpenseDetails(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-medium outline-none"
                />
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">
                  Optional: Link to Wedding(s)
                </label>
                {crmWeddings.length === 0 ? (
                  <p className="text-[11px] text-neutral-400 italic">No booked weddings in CRM.</p>
                ) : (
                  <div className="max-h-32 overflow-y-auto border border-neutral-300 p-2 rounded-lg bg-neutral-50 space-y-1">
                    {crmWeddings.map((w) => {
                      const isChecked = expenseWeddings.includes(w.id);
                      return (
                        <label
                          key={w.id}
                          className="flex items-center gap-2 p-1.5 rounded hover:bg-white cursor-pointer transition text-[11px]"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setExpenseWeddings([...expenseWeddings, w.id]);
                              } else {
                                setExpenseWeddings(expenseWeddings.filter((id) => id !== w.id));
                              }
                            }}
                          />
                          <span className="font-bold text-neutral-800">
                            💍 {w.title} — {w.resortName} (Deal: ₹{w.closedDealAmount?.toLocaleString()})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 border border-neutral-300 font-bold rounded-lg uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-neutral-950 text-white font-black rounded-lg uppercase hover:bg-neutral-800 transition"
                >
                  Deduct & Log Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Pay Vendor from Float */}
      {showFloatVendorPayModal && canManageFloats && selectedFloat && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-base font-black uppercase text-blue-950">Pay Vendor From {selectedFloat.staffName}&apos;s Float</h2>
              <button onClick={() => setShowFloatVendorPayModal(false)} className="font-black">✕</button>
            </div>
            <form onSubmit={handleRecordVendorPayFromFloat} className="space-y-4">
              <div>
                <label className="block font-black mb-1 uppercase">Choose Vendor *</label>
                <select
                  required
                  onChange={(e) => setSelectedVendorForFloatPay(vendorsList.find((v) => v.id === e.target.value) || null)}
                  className="w-full border p-2 rounded bg-neutral-50 font-bold"
                >
                  <option value="">-- Choose Vendor --</option>
                  {vendorsList.map((v) => (
                    <option key={v.id} value={v.id}>{v.vendorName} ({v.category}) — Due: ₹{v.currentBalance || 0}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black mb-1 uppercase">Amount to Disburse (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 5000"
                    value={floatVendorPayAmount}
                    onChange={(e) => setFloatVendorPayAmount(Number(e.target.value))}
                    className="w-full border p-2 rounded bg-neutral-50 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-black mb-1 uppercase">Type *</label>
                  <select
                    value={floatVendorPayTxnType}
                    onChange={(e) => setFloatVendorPayTxnType(e.target.value as any)}
                    className="w-full border p-2 rounded bg-neutral-50 font-bold"
                  >
                    <option value="PAYMENT">Standard Payment</option>
                    <option value="ADVANCE">Advance Payout</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-black mb-1 uppercase">Mode *</label>
                <select
                  value={floatVendorPayMode}
                  onChange={(e) => setFloatVendorPayMode(e.target.value as PaymentMode)}
                  className="w-full border p-2 rounded bg-neutral-50 font-bold"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer - IMPS/RTGS">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="block font-black mb-1 uppercase">Remarks</label>
                <input
                  placeholder="e.g. Stage lighting deposit handed over on site..."
                  value={floatVendorPayRemarks}
                  onChange={(e) => setFloatVendorPayRemarks(e.target.value)}
                  className="w-full border p-2 rounded bg-neutral-50"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowFloatVendorPayModal(false)} className="px-4 py-2 border font-bold rounded uppercase">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-blue-700 text-white font-black rounded uppercase hover:bg-blue-800">Deduct & Disburse to Vendor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Pay Staff Salary/Advance from Float */}
      {showFloatStaffPayModal && canManageFloats && selectedFloat && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-base font-black uppercase text-purple-950">Pay Staff Salary From {selectedFloat.staffName}&apos;s Float</h2>
              <button onClick={() => setShowFloatStaffPayModal(false)} className="font-black">✕</button>
            </div>
            <form onSubmit={handleRecordStaffPayFromFloat} className="space-y-4">
              <div>
                <label className="block font-black mb-1 uppercase">Choose Beneficiary Staff *</label>
                <select
                  required
                  value={selectedStaffForFloatPay}
                  onChange={(e) => setSelectedStaffForFloatPay(e.target.value)}
                  className="w-full border p-2 rounded bg-neutral-50 font-bold"
                >
                  <option value="">-- Choose Staff Member --</option>
                  {staffList.map((s) => (
                    <option key={s.uid} value={s.uid}>{s.displayName || s.email} ({s.role})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black mb-1 uppercase">Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 3000"
                    value={floatStaffPayAmount}
                    onChange={(e) => setFloatStaffPayAmount(Number(e.target.value))}
                    className="w-full border p-2 rounded bg-neutral-50 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-black mb-1 uppercase">Type *</label>
                  <select
                    value={floatStaffPayTxnType}
                    onChange={(e) => setFloatStaffPayTxnType(e.target.value as any)}
                    className="w-full border p-2 rounded bg-neutral-50 font-bold"
                  >
                    <option value="ADVANCE_PAYMENT">Advance Given</option>
                    <option value="SALARY_CREDIT">Salary Payment</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-black mb-1 uppercase">Mode *</label>
                <select
                  value={floatStaffPayMode}
                  onChange={(e) => setFloatStaffPayMode(e.target.value as PaymentMode)}
                  className="w-full border p-2 rounded bg-neutral-50 font-bold"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                </select>
              </div>
              <div>
                <label className="block font-black mb-1 uppercase">Remarks</label>
                <input
                  placeholder="e.g. Event travel food advance given in cash..."
                  value={floatStaffPayRemarks}
                  onChange={(e) => setFloatStaffPayRemarks(e.target.value)}
                  className="w-full border border-neutral-300 p-2 rounded bg-neutral-50 focus:bg-white text-neutral-950 outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowFloatStaffPayModal(false)} className="px-4 py-2 border font-bold rounded uppercase">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-purple-700 text-white font-black rounded uppercase hover:bg-purple-800">Deduct & Pay Staff</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Funding & Top-Up History */}
      {showFundingHistoryModal && selectedFloat && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 border border-neutral-300 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <div>
                <h2 className="text-base font-black uppercase text-neutral-950">
                  Funding, Top-Ups & Float Transfer History
                </h2>
                <p className="text-[11px] text-neutral-500">
                  Beneficiary: {selectedFloat.staffName} (Status: {selectedFloat.status})
                </p>
              </div>
              <button
                onClick={() => setShowFundingHistoryModal(false)}
                className="text-neutral-400 hover:text-black font-black text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Initial Disbursement Card */}
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-neutral-900 text-white">
                    Initial Float Disbursal
                  </span>
                  <span className="font-bold text-neutral-500 text-[11px]">
                    {new Date(selectedFloat.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <div>
                    <p className="font-bold text-neutral-800">
                      Disbursed via {selectedFloat.disbursementPaymentDetails.mode}
                    </p>
                    {selectedFloat.disbursementPaymentDetails.fromAccount && (
                      <p className="text-[10px] text-neutral-500">
                        From: {selectedFloat.disbursementPaymentDetails.fromAccount}
                      </p>
                    )}
                  </div>
                  <span className="text-base font-black text-emerald-600">
                    +₹{selectedFloat.initialDisbursedAmount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Top-Ups and Peer Transfers Table */}
              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-100 text-neutral-500 text-[10px] uppercase font-bold border-b border-neutral-200">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5">Details / Remarks</th>
                      <th className="p-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {fundingHistoryList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-neutral-400">
                          NO TOP-UPS OR CASH TRANSFERS RECORDED FOR THIS FLOAT.
                        </td>
                      </tr>
                    ) : (
                      fundingHistoryList.map((entry) => {
                        const isTransferIn = entry.type === "TRANSFER_IN";
                        const isTransferOut = entry.type === "TRANSFER_OUT";
                        const isPositive = Number(entry.amount) > 0;

                        return (
                          <tr key={entry.id} className="hover:bg-neutral-50 transition">
                            <td className="p-2.5 font-bold whitespace-nowrap">
                              {entry.date || entry.createdAt?.split("T")[0]}
                            </td>
                            <td className="p-2.5 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-black border ${
                                  isTransferIn
                                    ? "bg-teal-50 text-teal-800 border-teal-300"
                                    : isTransferOut
                                    ? "bg-amber-50 text-amber-800 border-amber-300"
                                    : "bg-blue-50 text-blue-800 border-blue-300"
                                }`}
                              >
                                {isTransferIn
                                  ? "RECEIVED (TRANSFER)"
                                  : isTransferOut
                                  ? "SENT (TRANSFER)"
                                  : "COMPANY TOP-UP"}
                              </span>
                            </td>
                            <td className="p-2.5 text-[11px] text-neutral-700">
                              <p className="font-semibold">{entry.remarks || "—"}</p>
                              {entry.paymentDetails?.mode && (
                                <p className="text-[10px] text-neutral-400">
                                  Mode: {entry.paymentDetails.mode}
                                </p>
                              )}
                            </td>
                            <td
                              className={`p-2.5 text-right font-black whitespace-nowrap ${
                                isPositive ? "text-emerald-600" : "text-rose-600"
                              }`}
                            >
                              {isPositive ? "+" : ""}₹{Math.abs(Number(entry.amount)).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setShowFundingHistoryModal(false)}
                className="px-4 py-2 bg-neutral-900 text-white font-bold rounded-lg uppercase"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Transfer Float Balance to Another Staff */}
      {showTransferFloatModal && canManageFloats && selectedFloat && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-mono text-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h2 className="text-base font-black uppercase text-teal-950">
                  Transfer Float Balance
                </h2>
                <p className="text-[11px] text-neutral-500">
                  From: {selectedFloat.staffName} (Available: ₹{selectedFloat.currentFloatBalance.toLocaleString()})
                </p>
              </div>
              <button
                onClick={() => setShowTransferFloatModal(false)}
                className="font-black text-neutral-400 hover:text-black"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleTransferFloat} className="space-y-4">
              <div>
                <label className="block font-black mb-1 uppercase text-neutral-800">
                  Select Target Staff Member *
                </label>
                <select
                  required
                  value={targetTransferFloatId}
                  onChange={(e) => setTargetTransferFloatId(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 font-bold outline-none"
                >
                  <option value="">-- Choose Recipient Active Float --</option>
                  {activeFloats
                    .filter((f) => f.id !== selectedFloat.id)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.staffName} (Current Float: ₹{f.currentFloatBalance.toLocaleString()})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black mb-1 uppercase text-neutral-800">
                    Amount to Handover (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max={selectedFloat.currentFloatBalance}
                    placeholder="e.g. 10000"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(Number(e.target.value))}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block font-black mb-1 uppercase text-neutral-800">
                    Transfer Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black mb-1 uppercase text-neutral-800">
                  Reason / Handover Note
                </label>
                <input
                  placeholder="e.g. Extra cash given for vendor stage advance..."
                  value={transferRemarks}
                  onChange={(e) => setTransferRemarks(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 outline-none"
                />
              </div>

              <div className="bg-teal-50 border border-teal-200 p-3 rounded-lg text-[11px] text-teal-800">
                ℹ️ This is an internal float transfer. It adjusts staff custody balances without creating an expense entry in company accounts.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowTransferFloatModal(false)}
                  className="px-4 py-2 border font-bold rounded-lg uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-teal-700 text-white font-black rounded-lg uppercase hover:bg-teal-800 transition"
                >
                  Confirm Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}