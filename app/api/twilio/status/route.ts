import { db } from "../../../../lib/firebase";
import { collectionGroup, getDocs, updateDoc, doc } from "firebase/firestore";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const messageStatus = formData.get("MessageStatus") as string; // 'delivered', 'read', 'failed', 'sent'
    const to = formData.get("To") as string; // 'whatsapp:+91...'

    const cleanToPhone = to ? to.replace("whatsapp:", "").replace(/[^0-9]/g, "") : "";

    if (cleanToPhone && messageStatus) {
      const rsvpGroupSnap = await getDocs(collectionGroup(db, "rsvps"));
      rsvpGroupSnap.forEach(async (d) => {
        const data = d.data();
        const guestPhoneClean = (data.phone || "").replace(/[^0-9]/g, "");
        if (guestPhoneClean.slice(-10) === cleanToPhone.slice(-10)) {
          await updateDoc(doc(db, d.ref.path), {
            whatsappStatus: messageStatus,
            whatsappStatusUpdatedAt: new Date().toISOString(),
          });
        }
      });
    }

    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  } catch (err) {
    console.error("Status callback error:", err);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}