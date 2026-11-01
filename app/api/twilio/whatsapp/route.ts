import { NextResponse } from "next/server";
import { db, storage } from "../../../../lib/firebase";
import { collectionGroup, getDocs, updateDoc, doc, collection, addDoc, query, where, limit } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// Set maximum duration for Next.js serverless function (up to 60s if supported by plan)
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ status: "Twilio WhatsApp Webhook is active" });
}

export async function POST(req: Request) {
  try {
    const textData = await req.text();
    const params = new URLSearchParams(textData);

    const from = params.get("From") || "";
    const rawBody = params.get("Body") || "";
    const messageSid = params.get("MessageSid") || "";
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);
    const cleanSenderPhone = from.replace("whatsapp:", "").replace(/[^0-9]/g, "");

    if (!cleanSenderPhone) {
      return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
    }

    const tenDigitPhone = cleanSenderPhone.slice(-10);

    // 1. FAST GUEST MATCHING (< 200ms)
    let matchedGuestDoc: any = null;

    // Check by cleanPhone
    try {
      const qClean = query(collectionGroup(db, "rsvps"), where("cleanPhone", "==", tenDigitPhone), limit(1));
      const snapClean = await getDocs(qClean);
      if (!snapClean.empty) matchedGuestDoc = snapClean.docs[0];
    } catch (e) {
      // ignore
    }

    // Check by standard phone variants
    if (!matchedGuestDoc) {
      for (const candidate of [tenDigitPhone, cleanSenderPhone, `+91${tenDigitPhone}`, `+${cleanSenderPhone}`]) {
        try {
          const qDirect = query(collectionGroup(db, "rsvps"), where("phone", "==", candidate), limit(1));
          const snapDirect = await getDocs(qDirect);
          if (!snapDirect.empty) {
            matchedGuestDoc = snapDirect.docs[0];
            break;
          }
        } catch (e) {
          // ignore
        }
      }
    }

    // Fallback scan if not indexed yet
    if (!matchedGuestDoc) {
      const allRsvpsSnap = await getDocs(collectionGroup(db, "rsvps"));
      for (const d of allRsvpsSnap.docs) {
        const guestPhoneClean = (d.data().phone || "").replace(/[^0-9]/g, "");
        if (guestPhoneClean.slice(-10) === tenDigitPhone) {
          matchedGuestDoc = d;
          break;
        }
      }
    }

    if (!matchedGuestDoc) {
      console.warn(`[Twilio Inbound] No guest record matched phone ${cleanSenderPhone}`);
      return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
    }

    // 2. EXTRACT MEDIA URLS INSTANTLY (Prevents 15-second timeout)
    const initialMediaUrls: string[] = [];
    const mediaItems: { url: string; contentType: string }[] = [];

    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = params.get(`MediaUrl${i}`);
      const contentType = (params.get(`MediaContentType${i}`) || "application/pdf").toLowerCase();
      if (mediaUrl) {
        initialMediaUrls.push(mediaUrl);
        mediaItems.push({ url: mediaUrl, contentType });
      }
    }

    let messageBody = rawBody.trim();
    if (!messageBody && initialMediaUrls.length > 0) {
      const isPdf = mediaItems.some((m) => m.contentType.includes("pdf"));
      messageBody = isPdf ? "📄 Sent a PDF Document" : "📷 Sent a Photo/ID";
    }

    // 3. WRITE MESSAGE TO FIRESTORE IMMEDIATELY (Instantly appears in the live chat!)
    const guestData = matchedGuestDoc.data();
    const guestDocPath = matchedGuestDoc.ref.path;

    const messageRef = await addDoc(collection(db, guestDocPath, "messages"), {
      direction: "inbound",
      body: messageBody || "Replied on WhatsApp",
      mediaUrls: initialMediaUrls,
      sid: messageSid,
      status: "delivered",
      timestamp: new Date().toISOString(),
      senderName: guestData.name || "Guest",
    });

    // 4. 2-HOUR AUTO-REPLY LOGIC
    const lastInboundTime = guestData.lastGuestInboundAt ? new Date(guestData.lastGuestInboundAt).getTime() : 0;
    const now = Date.now();
    const shouldSendAutoReply = !lastInboundTime || now - lastInboundTime > 2 * 60 * 60 * 1000;

    let replyText = "";
    if (shouldSendAutoReply) {
      replyText = "Namaste, We have received your message and our team will get back to you ASAP. Regards, Team Brajwal";

      await addDoc(collection(db, guestDocPath, "messages"), {
        direction: "outbound",
        body: replyText,
        mediaUrls: [],
        status: "delivered",
        timestamp: new Date().toISOString(),
        senderName: "Team Brajwal (Auto-Reply)",
      });
    }

    // 5. UPDATE GUEST DOCUMENT
    const currentIds = guestData.idCardUrls || [];
    await updateDoc(doc(db, guestDocPath), {
      idCardUrls: [...currentIds, ...initialMediaUrls],
      lastMessage: messageBody || "Replied on WhatsApp",
      lastMessageAt: new Date().toISOString(),
      lastGuestInboundAt: new Date().toISOString(),
      hasUnreadMessages: true,
      cleanPhone: tenDigitPhone,
      ...(initialMediaUrls.length > 0 ? { status: "IDs Received" } : {}),
    });

    // 6. ASYNCHRONOUS FIREBASE STORAGE MIRRORING (Runs in background without delaying Twilio)
    if (mediaItems.length > 0) {
      (async () => {
        try {
          const accountSid = process.env.TWILIO_ACCOUNT_SID;
          const authToken = process.env.TWILIO_AUTH_TOKEN;
          const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
          const firebaseStorageUrls: string[] = [];

          for (let i = 0; i < mediaItems.length; i++) {
            const item = mediaItems[i];
            const res = await fetch(item.url, { headers: { Authorization: authHeader } });
            if (res.ok) {
              const arrayBuffer = await res.arrayBuffer();
              const ext = item.contentType.includes("pdf") ? "pdf" : "jpg";
              const fileName = `id_cards/${cleanSenderPhone}_${Date.now()}_${i}.${ext}`;
              const storageRef = ref(storage, fileName);

              await uploadBytes(storageRef, new Uint8Array(arrayBuffer), { contentType: item.contentType });
              const firebaseDownloadUrl = await getDownloadURL(storageRef);
              firebaseStorageUrls.push(firebaseDownloadUrl);
            }
          }

          if (firebaseStorageUrls.length > 0) {
            // Replace Twilio temporary media links with permanent Firebase URLs
            await updateDoc(doc(db, guestDocPath, "messages", messageRef.id), {
              mediaUrls: firebaseStorageUrls,
            });

            // Update parent guest idCardUrls list with permanent links
            const freshGuestSnap = await getDocs(query(collection(db, guestDocPath)));
            await updateDoc(doc(db, guestDocPath), {
              idCardUrls: firebaseStorageUrls,
            });
          }
        } catch (bgErr) {
          console.error("[Background Storage Upload Error]:", bgErr);
        }
      })();
    }

    // Respond immediately to Twilio within < 1 second!
    if (replyText) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyText}</Message></Response>`;
      return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
    }

    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  } catch (err: any) {
    console.error("[Twilio Inbound Webhook Fatal]:", err);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}