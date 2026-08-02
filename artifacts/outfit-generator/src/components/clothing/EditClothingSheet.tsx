import React from "react";
import { Sheet } from "@/components/ui/sheet";
import { ClothingForm, ClothingFormData } from "./ClothingForm";
import { 
  useUpdateClothingItem, 
  useDeleteClothingItem,
  useListClothing,
  getListClothingQueryKey,
} from "@/hooks/useLocalWardrobe";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";

interface EditClothingSheetProps {
  itemId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditClothingSheet({ itemId, open, onOpenChange }: EditClothingSheetProps) {
  // Load all items and find the one we need (avoids a separate get-by-id query)
  const { data: items, isLoading } = useListClothing({}, { query: { enabled: !!itemId && open } });
  const item = items?.find(i => i.id === itemId) ?? null;
  
  const updateItem = useUpdateClothingItem();
  const deleteItem = useDeleteClothingItem();
  const queryClient = useQueryClient();

  const handleSubmit = (data: ClothingFormData) => {
    if (!itemId) return;
    
    updateItem.mutate(
      { id: itemId, data: { ...data, imageObjectPath: data.imageObjectPath || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          onOpenChange(false);
        }
      }
    );
  };

  const handleDelete = () => {
    if (!itemId) return;
    if (confirm("Are you sure you want to delete this item?")) {
      deleteItem.mutate({ id: itemId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          onOpenChange(false);
        }
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Edit Item">
      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : item ? (
        <div className="flex flex-col gap-6">
          <ClothingForm 
            initialData={{
              name: item.name,
              category: item.category as ClothingFormData["category"],
              color: item.color || undefined,
              brand: item.brand || undefined,
              notes: item.notes || undefined,
              isFavorite: item.isFavorite,
              imageObjectPath: item.imageObjectPath,
            }}
            onSubmit={handleSubmit} 
            isSubmitting={updateItem.isPending}
            submitLabel="Update Item"
          />
          <button 
            onClick={handleDelete}
            disabled={deleteItem.isPending}
            className="flex items-center justify-center gap-2 w-full py-4 text-destructive border-2 border-destructive font-bold uppercase tracking-widest active:bg-destructive active:text-white transition-colors"
          >
            <Trash2 className="w-5 h-5" />
            Delete Item
          </button>
        </div>
      ) : null}
    </Sheet>
  );
}
