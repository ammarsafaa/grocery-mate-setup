import {smartScore as s} from "./search";
import {test,expect} from "vitest";
test("x",()=>{expect(s("بيبسى",["بيبسي"])).toBeGreaterThan(0);expect(s("تمم",["تمن عنبر"])).toBeGreaterThan(0);expect(s("حليب كبير",["كبير حليب"])).toBeGreaterThan(0);expect(s("اسماك",["أسماك"])).toBeGreaterThan(0);expect(s("شاي",["سكر"])).toBe(0);});
