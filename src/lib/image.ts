/** Shrinks an uploaded picture to a small JPEG data URL so it stays light in the local database. */
export function resizeImage(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        const ctx = c.getContext("2d");
        if (!ctx) return reject(new Error("تعذر تجهيز الصورة"));
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Speaks a sentence in Arabic using the Windows/browser voice, if one is installed. */
export function speakArabic(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ar-SA";
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("ar"));
  if (voice) u.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
