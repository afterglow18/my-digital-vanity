import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2 } from "lucide-react";
import { getImageUrl } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { removeBackground } from "@/lib/backgroundRemoval";
import type { RemovalProgress } from "@/lib/backgroundRemoval";
import { PhotoCompareSheet } from "@/components/clothing/PhotoCompareSheet";

const CATEGORIES: ClothingCategory[] = ["makeup", "skincare", "hair", "fragrances"];

// Local enum replacing the generated API type
const CLOTHING_CATEGORIES = ["tops", "bottoms", "shoes", "accessories", "outerwear", "dresses"] as const;
type ClothingCategory = typeof CLOTHING_CATEGORIES[number];

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum(CLOTHING_CATEGORIES),
  color: z.string().optional(),
  brand: z.string().optional(),
  notes: z.string().optional(),
  isFavorite: z.boolean().default(false),
  imageObjectPath: z.string().optional().nullable(),
});

export type ClothingFormData = z.infer<typeof formSchema>;

interface ClothingFormProps {
  initialData?: Partial<ClothingFormData>;
  onSubmit: (data: ClothingFormData) => void;
  isSubmitting: boolean;
  submitLabel: string;
}

/** Resize a File to at most 800px wide and return a JPEG data URL. */
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 800 / img.naturalWidth);
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

type UploadPhase = "idle" | "cleaning" | "comparing";

interface CompareState {
  originalDataUrl: string;
  cleanedDataUrl:  string;
  hadSubject:      boolean;
}

export function ClothingForm({ initialData, onSubmit, isSubmitting, submitLabel }: ClothingFormProps) {
  const form = useForm<ClothingFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || "",
      category: (initialData?.category as ClothingCategory) || "tops",
      color: initialData?.color || "",
      brand: initialData?.brand || "",
      notes: initialData?.notes || "",
      isFavorite: initialData?.isFavorite || false,
      imageObjectPath: initialData?.imageObjectPath || null,
    },
  });

  const imagePath = form.watch("imageObjectPath");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">

      {/* Image preview (read-only — images are added via QuickAddSheet) */}
      {imagePath && (
        <div className="aspect-[4/3] w-full border-4 border-black bg-muted overflow-hidden">
          <img src={getImageUrl(imagePath)!} alt="Item photo" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block font-bold uppercase text-sm mb-1">Item Name *</label>
          <input
            {...form.register("name")}
            placeholder="e.g. Vintage Plaid Skirt"
            className="w-full px-4 py-3 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:translate-y-0.5 focus:translate-x-0.5 outline-none transition-all font-medium"
          />
          {form.formState.errors.name && (
            <span className="text-destructive text-sm font-bold mt-1 block">{form.formState.errors.name.message}</span>
          )}
        </div>

        <div>
          <label className="block font-bold uppercase text-sm mb-2">Category *</label>
          <div className="grid grid-cols-3 gap-2">
            {CLOTHING_CATEGORIES.map(cat => (
              <label key={cat} className="cursor-pointer">
                <input
                  type="radio"
                  value={cat}
                  {...form.register("category")}
                  className="sr-only peer"
                />
                <div className="px-2 py-3 text-center border-2 border-black bg-white peer-checked:bg-secondary font-bold text-xs uppercase tracking-tight transition-colors">
                  {cat}
                </div>
                <span className="font-bold uppercase text-muted-foreground">Upload Photo</span>
              </div>
            )}
            
            {/* Cleaning overlay */}
            {uploadPhase === "cleaning" && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 px-6">
                <Loader2 className="w-12 h-12 text-white animate-spin" />
                <span className="text-white text-xs font-bold uppercase tracking-wider text-center">
                  {removalProgress?.stage === "loading"
                    ? `Downloading model… ${removalProgress.pct}%`
                    : "Removing background…"}
                </span>
                {removalProgress?.stage === "loading" && (
                  <div className="w-40 h-1.5 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-300"
                      style={{ width: `${removalProgress.pct}%` }}
                    />
                  </div>
                )}
              </div>
            )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-bold uppercase text-sm mb-1">Color</label>
            <input
              {...form.register("color")}
              placeholder="Yellow"
              className="w-full px-3 py-2 bg-white border-2 border-black focus:bg-accent outline-none font-medium"
            />
          </div>
          <div>
            <label className="block font-bold uppercase text-sm mb-1">Brand</label>
            <input
              {...form.register("brand")}
              placeholder="e.g. Thrifted"
              className="w-full px-3 py-2 bg-white border-2 border-black focus:bg-accent outline-none font-medium"
            />
          </div>
        </div>

        <div>
          <label className="block font-bold uppercase text-sm mb-1">Notes</label>
          <textarea
            {...form.register("notes")}
            placeholder="Totally matches with..."
            rows={3}
            className="w-full px-3 py-2 bg-white border-2 border-black focus:bg-accent outline-none font-medium resize-none"
          />
        </div>

        <label className="flex items-center gap-3 p-4 border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] cursor-pointer">
          <input
            type="checkbox"
            {...form.register("isFavorite")}
            className="w-6 h-6 border-2 border-black appearance-none checked:bg-primary checked:after:content-['★'] checked:after:text-black checked:after:flex checked:after:items-center checked:after:justify-center checked:after:h-full checked:after:text-sm transition-colors"
          />
          <span className="font-bold uppercase tracking-wider">Mark as Favorite</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="btn-brutalist py-4 rounded-xl w-full text-lg mt-4 disabled:opacity-50"
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> saving...
          </span>
        ) : submitLabel}
      </button>
    </form>
  );
}
