function updateBlockReason(shifts, heldCarts) {
  if (!Array.isArray(shifts) || !Array.isArray(heldCarts)) return "تعذر التحقق من بيانات الوردية";
  if (shifts.some((s) => !s.closedAt)) return "أغلق الوردية قبل تثبيت التحديث";
  if (heldCarts.length) return "أكمل الفواتير المعلقة قبل تثبيت التحديث";
  return null;
}
module.exports = { updateBlockReason };