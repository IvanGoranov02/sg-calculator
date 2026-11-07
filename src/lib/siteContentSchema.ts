import { z } from "zod";
import { imageSchema } from "@/lib/editorialContent";
import { getMessage, messages } from "@/lib/i18n/messages";
export function messageEntries(locale: "en" | "bg"): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  function walk(value: unknown, path: string) {
    if (typeof value === "string") out.push([path, value]);
    else if (value && typeof value === "object")
      for (const [key, v] of Object.entries(value))
        walk(v, path ? `${path}.${key}` : key);
  }
  walk(messages[locale], "");
  return out;
}
const copyMap = z.record(z.string().max(200), z.string().max(5000));
export const siteContentSchema = z
  .object({
    en: copyMap,
    bg: copyMap,
    images: z.record(z.string().max(400), imageSchema),
    version: z.string().nullable(),
  })
  .superRefine((input, ctx) => {
    for (const locale of ["en", "bg"] as const)
      for (const [key, value] of Object.entries(input[locale])) {
        const original = getMessage(locale, key);
        if (original === undefined) {
          ctx.addIssue({ code: "custom", message: `Unknown text key: ${key}` });
          continue;
        }
        const tokens = (s: string) =>
          [...s.matchAll(/\{\w+\}/g)]
            .map((m) => m[0])
            .sort()
            .join("|");
        if (tokens(original) !== tokens(value))
          ctx.addIssue({
            code: "custom",
            message: `Keep the placeholders in ${key}: ${tokens(original)}`,
          });
      }
    if (Object.keys(input.images).length > 200)
      ctx.addIssue({ code: "custom", message: "Too many image overrides." });
  });
