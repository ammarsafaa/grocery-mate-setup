import { Button } from "@/components/ui/button";
import { Store, Layers3, Palette, Printer, Scale, Send, Server, ScanBarcode, RefreshCw, HardDrive, Users, Trash2 } from "lucide-react";

const sections = [
  { id: "store", label: "المتجر", icon: Store },
  { id: "groups", label: "عرض المجموعات", icon: Layers3 },
  { id: "appearance", label: "المظهر وحجم المنتجات", icon: Palette },
  { id: "printer", label: "الطابعة", icon: Printer },
  { id: "rongta", label: "ميزان رونكتا", icon: Scale },
  { id: "aclas", label: "ميزان أكلاس", icon: Scale },
  { id: "telegram", label: "تيليجرام", icon: Send },
  { id: "server", label: "الخادم", icon: Server },
  { id: "barcode", label: "باركود الميزان", icon: ScanBarcode },
  { id: "updates", label: "التحديثات", icon: RefreshCw },
  { id: "backup", label: "النسخ الاحتياطي", icon: HardDrive },
  { id: "users", label: "المستخدمون", icon: Users },
  { id: "reset", label: "تصفير النظام", icon: Trash2 },
] as const;

export type SettingsSection = typeof sections[number]["id"];

export function SettingsNavigation({ active, onSelect }: { active: SettingsSection; onSelect: (id: SettingsSection) => void }) {
  return (
    <nav aria-label="أقسام الإعدادات" className="sticky top-0 z-20 flex flex-wrap gap-2 border-b border-border bg-background py-3">
      {sections.map(({ id, label, icon: Icon }) => (
        <Button key={id} type="button" variant={active === id ? "default" : "secondary"} aria-pressed={active === id} aria-controls={`settings-${id}`} onClick={() => onSelect(id)} className="h-auto min-h-10 whitespace-normal text-start">
          <Icon />{label}
        </Button>
      ))}
    </nav>
  );
}