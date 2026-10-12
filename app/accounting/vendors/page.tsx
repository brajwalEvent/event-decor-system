"use client";

import React, { useState, useEffect } from "react";
import { db, storage } from "../../../lib/firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc,
  query,
  where,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../../../context/AuthContext";
import { useRouter } from "next/navigation";
import type {
  VendorAccount,
  VendorBankAccount,
  VendorUpiAccount,
  VendorPurchase,
  VendorTransaction,
  PaymentMode,
  PaymentDetails,
} from "../../../types/accounting";
import { recordAuditLog } from "../../../lib/accountingAudit";

export default function VendorAccountingPage(): React.ReactElement {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  const isAccountant = (role as any) === "accountant";
  const canAccess = isSuperAdmin || isAccountant || role === "admin";

  // Data states
  const [vendors, setVendors] = useState<VendorAccount[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<VendorAccount | null>(null);
  const [purchases, setPurchases] = useState<VendorPurchase[]>([]);
  const [transactions, setTransactions] = useState<VendorTransaction[]>([]);
  const [categories, setCategories] = useState<string[]>([
    "Stage & Fabrication",
    "Floral Decor",
    "Sound & Lights",
    "Catering & Crockery",
    "Generators & Power",
    "Printing & Signages",
    "Transportation",
    "Manpower Agency",
  ]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [crmWeddings, setCrmWeddings] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Tab View
  const [activeTab, setActiveTab] = useState<"PURCHASES" | "PAYMENTS">("PURCHASES");

  // Modals
  const [showAddVendorModal, setShowAddVendorModal] = useState(false);
  const [showPaymentOptionsModal, setShowPaymentOptionsModal] = useState(false);
  const [showUpdateBankModal, setShowUpdateBankModal] = useState(false);
  const [showNewPurchaseModal, setShowNewPurchaseModal] = useState(false);
  const [showNewPaymentModal, setShowNewPaymentModal] = useState(false);

  // Form: New Vendor
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorMobile, setNewVendorMobile] = useState("");
  const [newVendorCategory, setNewVendorCategory] = useState("");
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // Form: Initial Bank Account for New Vendor
  const [initAccNum, setInitAccNum] = useState("");
  const [initIfsc, setInitIfsc] = useState("");
  const [initAccName, setInitAccName] = useState("");
  const [initBankName, setInitBankName] = useState("");
  const [initBankTag, setInitBankTag] = useState("Main Account");
  const [initUpiId, setInitUpiId] = useState("");
  const [initUpiTag, setInitUpiTag] = useState("Main UPI");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Form: Add Bank/UPI Details
  const [editBankAccNum, setEditBankAccNum] = useState("");
  const [editBankIfsc, setEditBankIfsc] = useState("");
  const [editBankAccName, setEditBankAccName] = useState("");
  const [editBankName, setEditBankName] = useState("");
  const [editBankTag, setEditBankTag] = useState("Main Account");
  const [editUpiId, setEditUpiId] = useState("");
  const [editUpiTag, setEditUpiTag] = useState("Main UPI");
  const [editQrFile, setEditQrFile] = useState<File | null>(null);

  // Form: Purchase
  const [purchDate, setPurchDate] = useState(new Date().toISOString().split("T")[0]);
  const [purchAmount, setPurchAmount] = useState<number | "">("");
  const [purchItems, setPurchItems] = useState("");
  const [purchType, setPurchType] = useState<"Service" | "Procurement" | "Rental">("Procurement");
  const [purchStaffUid, setPurchStaffUid] = useState("");
  const [purchWeddings, setPurchWeddings] = useState<string[]>([]);
  const [purchIsRecurring, setPurchIsRecurring] = useState(false);
  const [purchFreq, setPurchFreq] = useState<"Daily" | "Weekly" | "Monthly" | "Quarterly" | "Yearly">("Monthly");

  // Form: Payment
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payAmount, setPayAmount] = useState<number | "">("");
  const [payMode, setPayMode] = useState<PaymentMode>("Bank Transfer - IMPS/RTGS");
  const [payTxnType, setPayTxnType] = useState<"PAYMENT" | "ADVANCE">("PAYMENT");
  const [payFromAccount, setPayFromAccount] = useState("");
  const [payRemarks, setPayRemarks] = useState("");
  const [selectedSavedBankId, setSelectedSavedBankId] = useState("");
  const [selectedSavedUpiId, setSelectedSavedUpiId] = useState("");
  const [manualTxnId, setManualTxnId] = useState("");
  const [manualCashDesc, setManualCashDesc] = useState("");

  useEffect(() => {
    if (!loading && (!user || !canAccess)) {
      router.push("/handovers");
    }
  }, [user, role, isSuperAdmin, loading, canAccess, router]);

  // Load Initial Data
  const loadInitialData = async () => {
    try {
      setLoadingData(true);

      const vSnap = await getDocs(collection(db, "accounting_vendors"));
      const vList = vSnap.docs.map((d) => ({ id: d.id, ...d.data() } as VendorAccount));
      setVendors(vList);
      if (vList.length > 0 && !selectedVendor) {
        setSelectedVendor(vList[0]);
      }

      const userSnap = await getDocs(collection(db, "users"));
      setStaffList(userSnap.docs.map((d) => ({ uid: d.id, ...d.data() })));

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

      const catSnap = await getDocs(collection(db, "accounting_categories")).catch(() => ({ docs: [] }));
      const dynamicCats = catSnap.docs.map((d) => d.data().name).filter(Boolean);
      if (dynamicCats.length > 0) {
        setCategories((prev) => Array.from(new Set([...prev, ...dynamicCats])));
      }
    } catch (err) {
      console.error("Error loading vendor accounting:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user && canAccess) {
      loadInitialData();
    }
  }, [user, canAccess]);

  // Fetch purchases & transactions without composite index requirements
  const fetchVendorLedger = async (vendorId: string) => {
    try {
      const pQ = query(
        collection(db, "accounting_vendor_purchases"),
        where("vendorId", "==", vendorId)
      );
      const pSnap = await getDocs(pQ);
      const pList = pSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as VendorPurchase))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPurchases(pList);

      const tQ = query(
        collection(db, "accounting_vendor_transactions"),
        where("vendorId", "==", vendorId)
      );
      const tSnap = await getDocs(tQ);
      const tList = tSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as VendorTransaction))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(tList);
    } catch (err) {
      console.error("Error fetching vendor transactions:", err);
    }
  };

  useEffect(() => {
    if (selectedVendor) {
      fetchVendorLedger(selectedVendor.id);
    }
  }, [selectedVendor]);

  // Upload QR code to Firebase Storage
  const uploadQrCode = async (file: File): Promise<string> => {
    const fileRef = ref(storage, `vendor_qr/${Date.now()}_${file.name}`);
    await uploadBytes(fileRef, file);
    return await getDownloadURL(fileRef);
  };

  // Submit: Onboard New Vendor
  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newVendorName.trim() || !newVendorMobile.trim()) return;

    try {
      setIsUploading(true);

      let qrCodeUrl = "";
      if (qrFile) {
        qrCodeUrl = await uploadQrCode(qrFile);
      }

      const categoryToUse = isCreatingCategory ? customCategoryInput.trim() : newVendorCategory;
      if (isCreatingCategory && customCategoryInput.trim()) {
        await addDoc(collection(db, "accounting_categories"), {
          name: customCategoryInput.trim(),
          createdAt: new Date().toISOString(),
        });
        setCategories((prev) => [...prev, customCategoryInput.trim()]);
      }

      const bankAccs: VendorBankAccount[] = initAccNum.trim()
        ? [
            {
              id: `bank_${Date.now()}`,
              accountNumber: initAccNum.trim(),
              ifscCode: initIfsc.trim().toUpperCase(),
              accountName: initAccName.trim(),
              bankName: initBankName.trim(),
              tag: initBankTag,
            },
          ]
        : [];

      const upiAccs: VendorUpiAccount[] = initUpiId.trim()
        ? [
            {
              id: `upi_${Date.now()}`,
              upiId: initUpiId.trim(),
              mobileNumber: newVendorMobile.trim(),
              qrCodeUrl: qrCodeUrl || undefined,
              tag: initUpiTag,
            },
          ]
        : [];

      const vendorDocRef = doc(collection(db, "accounting_vendors"));
      const newVendor: VendorAccount = {
        id: vendorDocRef.id,
        vendorName: newVendorName.trim(),
        mobileNumber: newVendorMobile.trim(),
        isMobileVerified: true,
        category: categoryToUse || "General Vendor",
        bankAccounts: bankAccs,
        upiAccounts: upiAccs,
        currentBalance: 0,
        totalPurchases: 0,
        totalPaid: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(vendorDocRef, newVendor);

      await recordAuditLog(user, {
        module: "VENDOR_LEDGER",
        action: "CREATE",
        targetId: vendorDocRef.id,
        targetName: newVendor.vendorName,
        newData: newVendor,
        notes: `Created vendor account for ${newVendor.vendorName} (${newVendor.mobileNumber})`,
      });

      setShowAddVendorModal(false);
      setNewVendorName("");
      setNewVendorMobile("");
      setInitAccNum("");
      setInitIfsc("");
      setInitAccName("");
      setInitBankName("");
      setInitUpiId("");
      setQrFile(null);
      await loadInitialData();
      setSelectedVendor(newVendor);
      alert(`✅ Vendor "${newVendor.vendorName}" onboarded successfully.`);
    } catch (err: any) {
      console.error(err);
      alert("Failed to create vendor: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Submit: Add/Update Bank Details
  const handleUpdateBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedVendor) return;

    try {
      setIsUploading(true);

      let qrUrl = "";
      if (editQrFile) {
        qrUrl = await uploadQrCode(editQrFile);
      }

      const updatedBankAccounts = [...selectedVendor.bankAccounts];
      if (editBankAccNum.trim()) {
        updatedBankAccounts.push({
          id: `bank_${Date.now()}`,
          accountNumber: editBankAccNum.trim(),
          ifscCode: editBankIfsc.trim().toUpperCase(),
          accountName: editBankAccName.trim(),
          bankName: editBankName.trim(),
          tag: editBankTag,
        });
      }

      const updatedUpiAccounts = [...selectedVendor.upiAccounts];
      if (editUpiId.trim() || qrUrl) {
        updatedUpiAccounts.push({
          id: `upi_${Date.now()}`,
          upiId: editUpiId.trim() || "QR_ONLY",
          qrCodeUrl: qrUrl || undefined,
          tag: editUpiTag,
        });
      }

      const updatePayload = {
        bankAccounts: updatedBankAccounts,
        upiAccounts: updatedUpiAccounts,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, "accounting_vendors", selectedVendor.id), updatePayload);

      await recordAuditLog(user, {
        module: "VENDOR_BANK_UPDATE",
        action: "UPDATE",
        targetId: selectedVendor.id,
        targetName: selectedVendor.vendorName,
        previousData: {
          bankAccounts: selectedVendor.bankAccounts,
          upiAccounts: selectedVendor.upiAccounts,
        },
        newData: updatePayload,
        notes: `Updated bank/UPI accounts for vendor ${selectedVendor.vendorName}`,
      });

      setSelectedVendor({
        ...selectedVendor,
        ...updatePayload,
      });

      setShowUpdateBankModal(false);
      setEditBankAccNum("");
      setEditBankIfsc("");
      setEditBankAccName("");
      setEditBankName("");
      setEditUpiId("");
      setEditQrFile(null);
      alert("✅ Payment options updated and logged to audit trail.");
    } catch (err: any) {
      console.error(err);
      alert("Failed to update bank details: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Helper to strip undefined values so Firestore doesn't crash
  function cleanFirestoreData(data: Record<string, any>) {
    return Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
  }

  // Submit: Log Purchase
  const handleRecordPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedVendor || !purchAmount || !purchStaffUid) return;

    const parsedAmount = Number(purchAmount);
    const chosenStaff = staffList.find((s) => s.uid === purchStaffUid);
    const linkedWeddingNames = crmWeddings
      .filter((w) => purchWeddings.includes(w.id))
      .map((w) => w.title || w.clientName || `Wedding #${w.id}`);

    try {
      const purchaseData: Omit<VendorPurchase, "id"> = {
        vendorId: selectedVendor.id,
        vendorName: selectedVendor.vendorName,
        date: purchDate,
        amount: parsedAmount,
        itemsDescription: purchItems.trim(),
        type: purchType,
        purchaseMadeByStaffUid: purchStaffUid,
        purchaseMadeByStaffName: chosenStaff?.displayName || chosenStaff?.email || "Staff",
        linkedWeddingIds: purchWeddings,
        linkedWeddingNames,
        isRecurring: purchIsRecurring,
        recurringFrequency: purchIsRecurring ? purchFreq : undefined,
        createdAt: new Date().toISOString(),
        createdByUid: user?.uid || "",
      };

      await addDoc(
        collection(db, "accounting_vendor_purchases"),
        cleanFirestoreData(purchaseData)
      );

      const updatedBalance = selectedVendor.currentBalance + parsedAmount;
      const updatedTotalPurchases = selectedVendor.totalPurchases + parsedAmount;

      const updatePayload = {
        currentBalance: updatedBalance,
        totalPurchases: updatedTotalPurchases,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, "accounting_vendors", selectedVendor.id), updatePayload);

      await recordAuditLog(user, {
        module: "VENDOR_LEDGER",
        action: "CREATE",
        targetId: selectedVendor.id,
        targetName: selectedVendor.vendorName,
        newData: {
          ...updatePayload,
          purchase: purchaseData,
        },
        notes: `Recorded purchase of ₹${parsedAmount} for ${selectedVendor.vendorName}`,
      });

      setSelectedVendor({
        ...selectedVendor,
        ...updatePayload,
      });

      setShowNewPurchaseModal(false);
      setPurchAmount("");
      setPurchItems("");
      setPurchWeddings([]);
      setPurchIsRecurring(false);
      fetchVendorLedger(selectedVendor.id);
      alert("✅ Purchase recorded.");
    } catch (err: any) {
      console.error(err);
      alert("Failed to log purchase: " + err.message);
    }
  };

  // Submit: Log Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedVendor || !payAmount) return;

    const parsedAmount = Number(payAmount);

    const paymentDetails: PaymentDetails = {
      mode: payMode,
      fromAccount: payFromAccount.trim() || undefined,
    };

    if (payMode === "UPI") {
      const selectedUpi = selectedVendor.upiAccounts.find((u) => u.id === selectedSavedUpiId);
      paymentDetails.upiId = selectedUpi?.upiId || selectedSavedUpiId;
      paymentDetails.mobileNumber = selectedUpi?.mobileNumber;
    } else if (payMode === "Bank Transfer - IMPS/RTGS") {
      const selectedBank = selectedVendor.bankAccounts.find((b) => b.id === selectedSavedBankId);
      paymentDetails.toAccountNumber = selectedBank?.accountNumber;
      paymentDetails.toBankName = selectedBank?.bankName;
      paymentDetails.toIfsc = selectedBank?.ifscCode;
      paymentDetails.toAccountName = selectedBank?.accountName;
      paymentDetails.transactionId = manualTxnId.trim();
    } else if (payMode === "Cash") {
      paymentDetails.cashDescription = manualCashDesc.trim();
    }

    try {
      const txnData: Omit<VendorTransaction, "id"> = {
        vendorId: selectedVendor.id,
        type: payTxnType,
        amount: parsedAmount,
        date: payDate,
        paymentDetails,
        remarks: payRemarks.trim(),
        createdAt: new Date().toISOString(),
        createdByUid: user?.uid || "",
        createdByEmail: user?.email || "Unknown",
      };

      await addDoc(collection(db, "accounting_vendor_transactions"), txnData);

      const updatedBalance = selectedVendor.currentBalance - parsedAmount;
      const updatedTotalPaid = selectedVendor.totalPaid + parsedAmount;

      const updatePayload = {
        currentBalance: updatedBalance,
        totalPaid: updatedTotalPaid,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, "accounting_vendors", selectedVendor.id), updatePayload);

      await recordAuditLog(user, {
        module: "VENDOR_LEDGER",
        action: "UPDATE",
        targetId: selectedVendor.id,
        targetName: selectedVendor.vendorName,
        newData: {
          ...updatePayload,
          transaction: txnData,
        },
        notes: `Disbursed ${payTxnType} of ₹${parsedAmount} via ${payMode}`,
      });

      setSelectedVendor({
        ...selectedVendor,
        ...updatePayload,
      });

      setShowNewPaymentModal(false);
      setPayAmount("");
      setPayRemarks("");
      setManualTxnId("");
      setManualCashDesc("");
      fetchVendorLedger(selectedVendor.id);
      alert("✅ Payment logged to vendor ledger.");
    } catch (err: any) {
      console.error(err);
      alert("Failed to post payment: " + err.message);
    }
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center font-mono text-xs uppercase tracking-widest text-neutral-600">
        INITIALIZING VENDOR ARCHITECTURE...
      </div>
    );
  }

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
                BRAJWAL ERP / VENDOR CREDIT MANAGEMENT
              </p>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-neutral-950 mt-1">
              Vendor Accounts & Credit Ledger
            </h1>
          </div>

          <button
            onClick={() => setShowAddVendorModal(true)}
            className="px-5 py-2.5 rounded-lg font-black text-xs uppercase tracking-wider bg-neutral-900 text-white hover:bg-neutral-800 transition shadow-[4px_4px_10px_rgba(0,0,0,0.15)] active:translate-y-0.5"
          >
            + Onboard New Vendor
          </button>
        </div>

        {/* Master Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Vendor List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-xl p-4 border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff]">
              <h2 className="text-xs font-mono font-black tracking-widest uppercase text-neutral-500 mb-3">
                Vendors Registry ({vendors.length})
              </h2>

              {vendors.length === 0 ? (
                <div className="text-center py-8 text-xs font-mono text-neutral-400">
                  NO VENDORS ONBOARDED YET.
                </div>
              ) : (
                <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
                  {vendors.map((v) => {
                    const isSelected = selectedVendor?.id === v.id;
                    const isAdvance = v.currentBalance < 0;
                    return (
                      <div
                        key={v.id}
                        onClick={() => setSelectedVendor(v)}
                        className={`p-4 rounded-xl cursor-pointer transition border ${
                          isSelected
                            ? "bg-neutral-950 text-white border-neutral-950 shadow-inner"
                            : "bg-white text-neutral-900 border-neutral-200 hover:border-neutral-400 shadow-sm"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-black text-sm tracking-tight">{v.vendorName}</p>
                            <span
                              className={`inline-block mt-1 text-[9px] font-mono px-2 py-0.5 rounded font-black border ${
                                isSelected
                                  ? "bg-neutral-800 text-neutral-300 border-neutral-700"
                                  : "bg-neutral-100 text-neutral-700 border-neutral-200"
                              }`}
                            >
                              {v.category}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-mono uppercase text-neutral-400">
                              {isAdvance ? "Advance Paid" : "Pending Due"}
                            </p>
                            <p
                              className={`text-sm font-black font-mono ${
                                isAdvance
                                  ? "text-amber-500"
                                  : v.currentBalance === 0
                                  ? isSelected
                                    ? "text-neutral-300"
                                    : "text-neutral-500"
                                  : "text-rose-500"
                              }`}
                            >
                              ₹{Math.abs(v.currentBalance).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 pt-2 border-t border-neutral-200/20 flex items-center justify-between text-[11px] font-mono text-neutral-400">
                          <span>Mob: {v.mobileNumber}</span>
                          <span>{v.bankAccounts.length} A/C · {v.upiAccounts.length} UPI</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Selected Vendor Profile */}
          <div className="lg:col-span-8 space-y-6">
            {selectedVendor ? (
              <>
                {/* Vendor Overview Bar */}
                <div className="bg-white rounded-xl p-6 border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-neutral-100 pb-4">
                    <div>
                      <h2 className="text-xl font-black text-neutral-950 font-mono tracking-tight">
                        {selectedVendor.vendorName}
                      </h2>
                      <p className="text-xs text-neutral-500 font-mono mt-0.5">
                        Category: <strong className="text-neutral-800">{selectedVendor.category}</strong> · Contact:{" "}
                        <strong className="text-neutral-800">{selectedVendor.mobileNumber}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowPaymentOptionsModal(true)}
                        className="px-3.5 py-2 border border-neutral-400 text-neutral-900 rounded-lg text-xs font-mono font-black uppercase hover:bg-neutral-100 transition shadow-sm"
                      >
                        💳 View Payment Options
                      </button>
                      <button
                        onClick={() => setShowUpdateBankModal(true)}
                        className="px-3.5 py-2 bg-neutral-900 text-white rounded-lg text-xs font-mono font-black uppercase hover:bg-neutral-800 transition"
                      >
                        + Add Bank / UPI
                      </button>
                    </div>
                  </div>

                  {/* Financial Balance Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
                    <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                      <p className="text-[10px] uppercase font-black tracking-widest text-neutral-500">
                        Total Purchases Logged
                      </p>
                      <p className="text-xl font-black text-neutral-900 mt-1">
                        ₹{selectedVendor.totalPurchases.toLocaleString()}
                      </p>
                    </div>

                    <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                      <p className="text-[10px] uppercase font-black tracking-widest text-neutral-500">
                        Total Amount Disbursed
                      </p>
                      <p className="text-xl font-black text-emerald-700 mt-1">
                        ₹{selectedVendor.totalPaid.toLocaleString()}
                      </p>
                    </div>

                    <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                      <p className="text-[10px] uppercase font-black tracking-widest text-neutral-500">
                        Current Outstanding Balance
                      </p>
                      <p
                        className={`text-xl font-black mt-1 ${
                          selectedVendor.currentBalance < 0
                            ? "text-amber-600"
                            : selectedVendor.currentBalance === 0
                            ? "text-neutral-700"
                            : "text-rose-600"
                        }`}
                      >
                        {selectedVendor.currentBalance < 0
                          ? `₹${Math.abs(selectedVendor.currentBalance).toLocaleString()} (ADVANCE)`
                          : `₹${selectedVendor.currentBalance.toLocaleString()} (DUE)`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sub-Ledger Navigator */}
                <div className="bg-white rounded-xl border border-neutral-200 shadow-[6px_6px_16px_#e5e7eb,-6px_-6px_16px_#ffffff] overflow-hidden">
                  <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-neutral-50">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveTab("PURCHASES")}
                        className={`px-4 py-2 rounded-lg font-mono text-xs font-black uppercase transition ${
                          activeTab === "PURCHASES"
                            ? "bg-neutral-950 text-white shadow-sm"
                            : "bg-white text-neutral-600 border border-neutral-200 hover:text-black"
                        }`}
                      >
                        📦 Purchases Registry ({purchases.length})
                      </button>
                      <button
                        onClick={() => setActiveTab("PAYMENTS")}
                        className={`px-4 py-2 rounded-lg font-mono text-xs font-black uppercase transition ${
                          activeTab === "PAYMENTS"
                            ? "bg-neutral-950 text-white shadow-sm"
                            : "bg-white text-neutral-600 border border-neutral-200 hover:text-black"
                        }`}
                      >
                        💸 Payments Ledger ({transactions.length})
                      </button>
                    </div>

                    {activeTab === "PURCHASES" ? (
                      <button
                        onClick={() => setShowNewPurchaseModal(true)}
                        className="px-4 py-2 rounded-lg font-mono text-xs font-black uppercase bg-neutral-950 text-white hover:bg-neutral-800 transition"
                      >
                        + Log New Purchase
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowNewPaymentModal(true)}
                        className="px-4 py-2 rounded-lg font-mono text-xs font-black uppercase bg-neutral-950 text-white hover:bg-neutral-800 transition"
                      >
                        + Record Payment
                      </button>
                    )}
                  </div>

                  {/* Purchases Table */}
                  {activeTab === "PURCHASES" && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-medium font-mono">
                        <thead className="bg-white border-b border-neutral-200 text-neutral-400 text-[10px] uppercase">
                          <tr>
                            <th className="p-3.5">Date</th>
                            <th className="p-3.5">Type</th>
                            <th className="p-3.5">Amount</th>
                            <th className="p-3.5">Items / Scope</th>
                            <th className="p-3.5">Staff In-Charge</th>
                            <th className="p-3.5">CRM Weddings</th>
                            <th className="p-3.5">Recurring</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {purchases.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-8 text-center text-neutral-400 text-xs">
                                NO PURCHASES LOGGED FOR THIS VENDOR YET.
                              </td>
                            </tr>
                          ) : (
                            purchases.map((p) => (
                              <tr key={p.id} className="hover:bg-neutral-50/80 transition">
                                <td className="p-3.5 font-bold whitespace-nowrap">{p.date}</td>
                                <td className="p-3.5 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black border border-neutral-300 bg-neutral-100 text-neutral-800">
                                    {p.type}
                                  </span>
                                </td>
                                <td className="p-3.5 font-black text-sm whitespace-nowrap text-neutral-950">
                                  ₹{p.amount.toLocaleString()}
                                </td>
                                <td className="p-3.5 max-w-xs">{p.itemsDescription}</td>
                                <td className="p-3.5 text-neutral-600 whitespace-nowrap">{p.purchaseMadeByStaffName}</td>
                                <td className="p-3.5 max-w-xs">
                                  {(() => {
                                    const displayNames =
                                      p.linkedWeddingNames && p.linkedWeddingNames.length > 0
                                        ? p.linkedWeddingNames
                                        : crmWeddings
                                            .filter((w) => p.linkedWeddingIds?.includes(w.id))
                                            .map((w) => w.title || w.clientName);

                                    return displayNames.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {displayNames.map((wName, i) => (
                                          <span
                                            key={i}
                                            className="text-[9px] bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200"
                                          >
                                            💍 {wName}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-neutral-400">—</span>
                                    );
                                  })()}
                                </td>
                                <td className="p-3.5 whitespace-nowrap">
                                  {p.isRecurring ? (
                                    <span className="text-[10px] bg-purple-50 text-purple-900 border border-purple-300 px-2 py-0.5 rounded font-black">
                                      🔄 {p.recurringFrequency}
                                    </span>
                                  ) : (
                                    <span className="text-neutral-400">One-time</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Payments Table */}
                  {activeTab === "PAYMENTS" && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-medium font-mono">
                        <thead className="bg-white border-b border-neutral-200 text-neutral-400 text-[10px] uppercase">
                          <tr>
                            <th className="p-3.5">Date</th>
                            <th className="p-3.5">Category</th>
                            <th className="p-3.5">Amount Disbursed</th>
                            <th className="p-3.5">Payment Details</th>
                            <th className="p-3.5">Remarks</th>
                            <th className="p-3.5">Accountant</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {transactions.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-neutral-400 text-xs">
                                NO PAYMENTS DISBURSED TO THIS VENDOR YET.
                              </td>
                            </tr>
                          ) : (
                            transactions.map((t) => (
                              <tr key={t.id} className="hover:bg-neutral-50/80 transition">
                                <td className="p-3.5 font-bold whitespace-nowrap">{t.date}</td>
                                <td className="p-3.5 whitespace-nowrap">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                                      t.type === "ADVANCE"
                                        ? "bg-amber-50 text-amber-900 border-amber-300"
                                        : "bg-emerald-50 text-emerald-900 border-emerald-300"
                                    }`}
                                  >
                                    {t.type}
                                  </span>
                                </td>
                                <td className="p-3.5 font-black text-sm whitespace-nowrap text-neutral-950">
                                  ₹{t.amount.toLocaleString()}
                                </td>
                                <td className="p-3.5 max-w-xs text-[11px] leading-tight">
                                  <span className="font-black text-neutral-900">{t.paymentDetails.mode}</span>
                                  {t.paymentDetails.mode === "UPI" && (
                                    <div className="text-neutral-500">
                                      UPI ID: {t.paymentDetails.upiId || "—"}
                                    </div>
                                  )}
                                  {t.paymentDetails.mode === "Bank Transfer - IMPS/RTGS" && (
                                    <div className="text-neutral-500">
                                      {t.paymentDetails.toBankName} · A/C: {t.paymentDetails.toAccountNumber} · Txn:{" "}
                                      {t.paymentDetails.transactionId}
                                    </div>
                                  )}
                                  {t.paymentDetails.mode === "Cash" && (
                                    <div className="text-neutral-500">Desc: {t.paymentDetails.cashDescription}</div>
                                  )}
                                </td>
                                <td className="p-3.5 text-neutral-600 max-w-xs">{t.remarks || "—"}</td>
                                <td className="p-3.5 text-neutral-400 text-[10px] whitespace-nowrap">
                                  {t.createdByEmail}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl p-12 text-center border border-neutral-200 text-neutral-400 font-mono text-xs">
                SELECT A VENDOR FROM THE LEFT COLUMN TO INSPECT THEIR CREDIT ARCHITECTURE.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: View Payment Options */}
      {showPaymentOptionsModal && selectedVendor && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 border border-neutral-300 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto font-mono">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <div>
                <h2 className="text-base font-black uppercase text-neutral-950">
                  Payment Channels: {selectedVendor.vendorName}
                </h2>
                <p className="text-xs text-neutral-500">Contact: {selectedVendor.mobileNumber}</p>
              </div>
              <button
                onClick={() => setShowPaymentOptionsModal(false)}
                className="text-neutral-400 hover:text-black font-black text-lg"
              >
                ✕
              </button>
            </div>

            {/* Bank Accounts Section */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase text-neutral-500 tracking-wider">
                Saved Bank Accounts ({selectedVendor.bankAccounts.length})
              </h3>
              {selectedVendor.bankAccounts.length === 0 ? (
                <p className="text-xs text-neutral-400 italic">No bank accounts linked yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedVendor.bankAccounts.map((b) => (
                    <div key={b.id} className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 space-y-1">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-neutral-200 text-neutral-800">
                          🏷️ {b.tag}
                        </span>
                        <span className="text-[10px] font-bold text-neutral-500">{b.bankName}</span>
                      </div>
                      <p className="text-xs font-bold text-neutral-900 pt-2">A/C: {b.accountNumber}</p>
                      <p className="text-[11px] text-neutral-600">Name: {b.accountName}</p>
                      <p className="text-[11px] text-neutral-500 font-mono">IFSC: {b.ifscCode}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* UPI & QR Section */}
            <div className="space-y-3 pt-3 border-t border-neutral-200">
              <h3 className="text-xs font-black uppercase text-neutral-500 tracking-wider">
                Saved UPI & QR Codes ({selectedVendor.upiAccounts.length})
              </h3>
              {selectedVendor.upiAccounts.length === 0 ? (
                <p className="text-xs text-neutral-400 italic">No UPI / QR profiles linked yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedVendor.upiAccounts.map((u) => (
                    <div key={u.id} className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-neutral-200 text-neutral-800">
                          🏷️ {u.tag}
                        </span>
                      </div>
                      {u.upiId && <p className="text-xs font-bold text-neutral-900 font-mono">UPI: {u.upiId}</p>}
                      {u.qrCodeUrl && (
                        <div className="pt-2">
                          <img
                            src={u.qrCodeUrl}
                            alt="Payment QR"
                            className="w-36 h-36 object-contain border border-neutral-300 rounded-lg bg-white p-1"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-neutral-200">
              <button
                onClick={() => setShowPaymentOptionsModal(false)}
                className="px-5 py-2 bg-neutral-950 text-white rounded-lg text-xs font-black uppercase font-mono"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Onboard New Vendor */}
      {showAddVendorModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 border border-neutral-300 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-mono text-xs">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <h2 className="text-base font-black uppercase text-neutral-950">
                Onboard New Vendor
              </h2>
              <button onClick={() => setShowAddVendorModal(false)} className="text-neutral-400 hover:text-black font-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateVendor} className="space-y-4">
              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Vendor / Firm Name *</label>
                <input
                  required
                  placeholder="e.g. Royal Decorators & Lights"
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                />
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Mobile Number *</label>
                <input
                  required
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={newVendorMobile}
                  onChange={(e) => setNewVendorMobile(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                />
              </div>

              {/* Vendor Category */}
              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Vendor Category *</label>
                {!isCreatingCategory ? (
                  <div className="flex gap-2">
                    <select
                      required
                      value={newVendorCategory}
                      onChange={(e) => setNewVendorCategory(e.target.value)}
                      className="flex-1 border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                    >
                      <option value="">-- Select Category --</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setIsCreatingCategory(true)}
                      className="px-3 py-2 border border-neutral-300 rounded-lg font-black hover:bg-neutral-100 uppercase text-[10px]"
                    >
                      + New
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      placeholder="Type custom category name..."
                      value={customCategoryInput}
                      onChange={(e) => setCustomCategoryInput(e.target.value)}
                      className="flex-1 border border-neutral-300 p-2.5 rounded-lg bg-white font-bold outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setIsCreatingCategory(false)}
                      className="px-3 py-2 bg-neutral-200 rounded-lg font-black text-[10px] uppercase"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Bank Account */}
              <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 space-y-3">
                <span className="block font-black text-neutral-900 uppercase">
                  Primary Banking Credentials (Optional)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Bank Name (e.g. HDFC Bank)"
                    value={initBankName}
                    onChange={(e) => setInitBankName(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-white"
                  />
                  <input
                    placeholder="Account Name"
                    value={initAccName}
                    onChange={(e) => setInitAccName(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Account Number"
                    value={initAccNum}
                    onChange={(e) => setInitAccNum(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-white"
                  />
                  <input
                    placeholder="IFSC Code"
                    value={initIfsc}
                    onChange={(e) => setInitIfsc(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-white uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 mb-1">Tag</label>
                  <select
                    value={initBankTag}
                    onChange={(e) => setInitBankTag(e.target.value)}
                    className="w-full border border-neutral-300 p-2 rounded bg-white"
                  >
                    <option value="Main Account">Main Account</option>
                    <option value="Family">Family</option>
                    <option value="Friend">Friend</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>
              </div>

              {/* UPI & QR */}
              <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 space-y-3">
                <span className="block font-black text-neutral-900 uppercase">Primary UPI & QR Code (Optional)</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="UPI ID (e.g. vendor@okaxis)"
                    value={initUpiId}
                    onChange={(e) => setInitUpiId(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-white"
                  />
                  <select
                    value={initUpiTag}
                    onChange={(e) => setInitUpiTag(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-white"
                  >
                    <option value="Main UPI">Main UPI</option>
                    <option value="Family">Family</option>
                    <option value="Friend">Friend</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 mb-1">Upload QR Code Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setQrFile(e.target.files?.[0] || null)}
                    className="w-full border border-neutral-300 p-1.5 rounded bg-white text-[11px]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowAddVendorModal(false)}
                  className="px-4 py-2 border border-neutral-300 font-bold rounded-lg uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-5 py-2 bg-neutral-950 text-white font-black rounded-lg uppercase hover:bg-neutral-800 disabled:opacity-50"
                >
                  {isUploading ? "Saving..." : "Create Vendor Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Bank/UPI Details */}
      {showUpdateBankModal && selectedVendor && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-neutral-300 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-mono text-xs">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <div>
                <h2 className="text-base font-black uppercase text-neutral-950">Add Payment Credentials</h2>
                <p className="text-[11px] text-neutral-500">Vendor: {selectedVendor.vendorName}</p>
              </div>
              <button onClick={() => setShowUpdateBankModal(false)} className="text-neutral-400 hover:text-black font-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateBankDetails} className="space-y-4">
              <div className="space-y-2">
                <span className="block font-black text-neutral-900 uppercase">New Bank Account (Optional)</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Bank Name"
                    value={editBankName}
                    onChange={(e) => setEditBankName(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-neutral-50 focus:bg-white"
                  />
                  <input
                    placeholder="Account Name"
                    value={editBankAccName}
                    onChange={(e) => setEditBankAccName(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-neutral-50 focus:bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Account Number"
                    value={editBankAccNum}
                    onChange={(e) => setEditBankAccNum(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-neutral-50 focus:bg-white"
                  />
                  <input
                    placeholder="IFSC Code"
                    value={editBankIfsc}
                    onChange={(e) => setEditBankIfsc(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-neutral-50 focus:bg-white uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 mb-1">Tag</label>
                  <select
                    value={editBankTag}
                    onChange={(e) => setEditBankTag(e.target.value)}
                    className="w-full border border-neutral-300 p-2 rounded bg-white"
                  >
                    <option value="Main Account">Main Account</option>
                    <option value="Family">Family</option>
                    <option value="Friend">Friend</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-neutral-200">
                <span className="block font-black text-neutral-900 uppercase">New UPI or QR Code (Optional)</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="UPI ID"
                    value={editUpiId}
                    onChange={(e) => setEditUpiId(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-neutral-50 focus:bg-white"
                  />
                  <select
                    value={editUpiTag}
                    onChange={(e) => setEditUpiTag(e.target.value)}
                    className="border border-neutral-300 p-2 rounded bg-white"
                  >
                    <option value="Main UPI">Main UPI</option>
                    <option value="Family">Family</option>
                    <option value="Friend">Friend</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 mb-1">Upload QR Code</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setEditQrFile(e.target.files?.[0] || null)}
                    className="w-full border border-neutral-300 p-1.5 rounded bg-white text-[11px]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowUpdateBankModal(false)}
                  className="px-4 py-2 border border-neutral-300 font-bold rounded-lg uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-5 py-2 bg-neutral-950 text-white font-black rounded-lg uppercase hover:bg-neutral-800 disabled:opacity-50"
                >
                  {isUploading ? "Saving..." : "Save Credentials"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Log Purchase */}
      {showNewPurchaseModal && selectedVendor && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 border border-neutral-300 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-mono text-xs">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <div>
                <h2 className="text-base font-black uppercase text-neutral-950">Record Purchase Entry</h2>
                <p className="text-[11px] text-neutral-500">Vendor: {selectedVendor.vendorName}</p>
              </div>
              <button onClick={() => setShowNewPurchaseModal(false)} className="text-neutral-400 hover:text-black font-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordPurchase} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">1. Date Of Purchase *</label>
                  <input
                    type="date"
                    required
                    value={purchDate}
                    onChange={(e) => setPurchDate(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">2. Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 85000"
                    value={purchAmount}
                    onChange={(e) => setPurchAmount(Number(e.target.value))}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">3. Items Description *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. 500 meters acoustic wiring, trussing structures, 20 LED parcans..."
                  value={purchItems}
                  onChange={(e) => setPurchItems(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-medium outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">4. Type Of Purchase *</label>
                  <select
                    value={purchType}
                    onChange={(e) => setPurchType(e.target.value as any)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  >
                    <option value="Procurement">Procurement</option>
                    <option value="Service">Service</option>
                    <option value="Rental">Rental</option>
                  </select>
                </div>

                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">5. Purchase Made By (Staff) *</label>
                  <select
                    required
                    value={purchStaffUid}
                    onChange={(e) => setPurchStaffUid(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  >
                    <option value="">-- Choose Staff --</option>
                    {staffList.map((s) => (
                      <option key={s.uid} value={s.uid}>
                        {s.displayName || s.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">
                  6. Linked CRM Wedding(s)
                </label>
                {crmWeddings.length === 0 ? (
                  <p className="text-[11px] text-neutral-400 italic">No booked weddings in CRM.</p>
                ) : (
                  <div className="max-h-36 overflow-y-auto border border-neutral-300 p-2 rounded-lg bg-neutral-50 space-y-1">
                    {crmWeddings.map((w) => {
                      const isChecked = purchWeddings.includes(w.id);
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
                                setPurchWeddings([...purchWeddings, w.id]);
                              } else {
                                setPurchWeddings(purchWeddings.filter((id) => id !== w.id));
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

              {/* Recurring Purchase Section */}
              <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={purchIsRecurring}
                    onChange={(e) => setPurchIsRecurring(e.target.checked)}
                  />
                  <span className="font-black text-neutral-950 uppercase">
                    7. Is this a Recurring Purchase? (Optional)
                  </span>
                </label>

                {purchIsRecurring && (
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-700 mb-1 uppercase">
                      8. Recurring Frequency *
                    </label>
                    <select
                      value={purchFreq}
                      onChange={(e) => setPurchFreq(e.target.value as any)}
                      className="w-full border border-neutral-300 p-2 rounded bg-white font-bold"
                    >
                      <option value="Daily">Daily</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Monthly">Monthly</option>
                      <option value="Quarterly">Quarterly</option>
                      <option value="Yearly">Yearly</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowNewPurchaseModal(false)}
                  className="px-4 py-2 border border-neutral-300 font-bold rounded-lg uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-neutral-950 text-white font-black rounded-lg uppercase hover:bg-neutral-800 transition"
                >
                  Post Purchase Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Payment */}
      {showNewPaymentModal && selectedVendor && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-neutral-300 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-mono text-xs">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-3">
              <div>
                <h2 className="text-base font-black uppercase text-neutral-950">Record Vendor Payment</h2>
                <p className="text-[11px] text-neutral-500">Beneficiary: {selectedVendor.vendorName}</p>
              </div>
              <button onClick={() => setShowNewPaymentModal(false)} className="text-neutral-400 hover:text-black font-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Payment Category *</label>
                  <select
                    value={payTxnType}
                    onChange={(e) => setPayTxnType(e.target.value as any)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  >
                    <option value="PAYMENT">Standard Bill Payment</option>
                    <option value="ADVANCE">Advance Disbursal</option>
                  </select>
                </div>
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Date *</label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="e.g. 25000"
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 font-bold outline-none text-sm"
                />
              </div>

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Mode of Payment *</label>
                <select
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value as PaymentMode)}
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
                  value={payFromAccount}
                  onChange={(e) => setPayFromAccount(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 outline-none"
                />
              </div>

              {/* Conditional Bank Transfer */}
              {payMode === "Bank Transfer - IMPS/RTGS" && (
                <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-300 space-y-3">
                  <span className="block font-black uppercase text-neutral-600">Select Vendor Bank Account *</span>
                  {selectedVendor.bankAccounts.length === 0 ? (
                    <p className="text-[11px] text-rose-600 font-bold">
                      No bank account on record. Please add one first.
                    </p>
                  ) : (
                    <select
                      required
                      value={selectedSavedBankId}
                      onChange={(e) => setSelectedSavedBankId(e.target.value)}
                      className="w-full border border-neutral-300 p-2 rounded bg-white font-bold"
                    >
                      <option value="">-- Choose Saved Bank Account --</option>
                      {selectedVendor.bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          [{b.tag}] {b.bankName} - A/C: {b.accountNumber} ({b.accountName})
                        </option>
                      ))}
                    </select>
                  )}
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-700 mb-1 uppercase">
                      Bank Transaction ID / UTR *
                    </label>
                    <input
                      required
                      placeholder="e.g. UTR-982187319"
                      value={manualTxnId}
                      onChange={(e) => setManualTxnId(e.target.value)}
                      className="w-full border border-neutral-300 p-2 rounded bg-white text-neutral-950 font-mono outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Conditional UPI */}
              {payMode === "UPI" && (
                <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-300 space-y-3">
                  <span className="block font-black uppercase text-neutral-600">Select Vendor UPI / QR *</span>
                  {selectedVendor.upiAccounts.length === 0 ? (
                    <p className="text-[11px] text-rose-600 font-bold">
                      No UPI profile saved. Please add one first.
                    </p>
                  ) : (
                    <select
                      required
                      value={selectedSavedUpiId}
                      onChange={(e) => setSelectedSavedUpiId(e.target.value)}
                      className="w-full border border-neutral-300 p-2 rounded bg-white font-bold"
                    >
                      <option value="">-- Choose Saved UPI / QR --</option>
                      {selectedVendor.upiAccounts.map((u) => (
                        <option key={u.id} value={u.id}>
                          [{u.tag}] UPI ID: {u.upiId} {u.qrCodeUrl ? "(QR Available)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Conditional Cash */}
              {payMode === "Cash" && (
                <div>
                  <label className="block font-black text-neutral-800 mb-1 uppercase">Description of Cash *</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Provide details on physical cash disbursement..."
                    value={manualCashDesc}
                    onChange={(e) => setManualCashDesc(e.target.value)}
                    className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block font-black text-neutral-800 mb-1 uppercase">Internal Remarks</label>
                <input
                  placeholder="Optional audit trail note..."
                  value={payRemarks}
                  onChange={(e) => setPayRemarks(e.target.value)}
                  className="w-full border border-neutral-300 p-2.5 rounded-lg bg-neutral-50 focus:bg-white text-neutral-950 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowNewPaymentModal(false)}
                  className="px-4 py-2 border border-neutral-300 font-bold rounded-lg uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-neutral-950 text-white font-black rounded-lg uppercase hover:bg-neutral-800 transition"
                >
                  Post Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}