/**
 * AddToLookbookSheet
 * Slide-up sheet listing all saved outfits.
 * Tapping an outfit toggles the current item in/out of that group.
 * A filled checkmark shows on outfits that already contain the item.
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import {
  useListOutfits,
  useAddItemToOutfit,
  useRemoveItemFromOutfit,
  getListOutfitsQueryKey,
  type ClothingItem,
  type Outfit,
} from '@/lib/local-api';
import { useQueryClient } from '@tanstack/react-query';
import { getImageUrl } from '@/lib/utils';

interface Props {
  item: ClothingItem;
  onClose: () => void;
}

export function AddToLookbookSheet({ item, onClose }: Props) {
  const { data: outfits = [] } = useListOutfits();
  const addItem    = useAddItemToOutfit();
  const removeItem = useRemoveItemFromOutfit();
  const queryClient = useQueryClient();

  const handleToggle = (outfitId: string, alreadyIn: boolean) => {
    if (alreadyIn) {
      removeItem.mutate(
        { id: outfitId, itemId: item.id },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) },
      );
    } else {
      addItem.mutate(
        { id: outfitId, itemId: item.id },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) },
      );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-4 py-3
                   bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
      >
        <div>
          <h2 className="font-display font-bold text-xl uppercase tracking-tight">
            Add to Lookbook
          </h2>
          <p className="text-xs text-black/40 font-medium">
            Tap a look to add or remove this item
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Outfit list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {outfits.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <p className="text-sm font-medium text-black/40">
              No saved looks yet. Create one in the Lookbook first.
            </p>
          </div>
        ) : (
          outfits.map((outfit: Outfit) => {
            const alreadyIn = (outfit.items ?? []).some((i: ClothingItem) => i.id === item.id);
            // Show up to 3 thumbnails
            const thumbItems = (outfit.items ?? []).slice(0, 3);

            return (
              <button
                key={outfit.id}
                onClick={() => handleToggle(outfit.id, alreadyIn)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all
                            active:translate-y-0.5 active:translate-x-0.5
                            ${alreadyIn
                              ? 'border-black bg-primary shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'
                              : 'border-black/20 bg-white hover:border-black/50'}`}
              >
                {/* 3-thumbnail row */}
                <div className="flex gap-1 shrink-0">
                  {thumbItems.length === 0 ? (
                    <div className="w-12 h-12 border-2 border-black/20 rounded bg-black/5 flex items-center justify-center">
                      <span className="text-[8px] font-bold text-black/20 uppercase">Empty</span>
                    </div>
                  ) : (
                    thumbItems.map((ti: ClothingItem) => (
                      <div
                        key={ti.id}
                        className="w-12 h-12 border border-black/20 rounded overflow-hidden"
                        style={{ background: '#FDECEF' }}
                      >
                        {ti.imageObjectPath ? (
                          <img
                            src={getImageUrl(ti.imageObjectPath)!}
                            alt={ti.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-[8px] font-bold uppercase text-black/20">—</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Outfit name */}
                <span className="flex-1 text-left font-display font-bold text-sm uppercase tracking-tight truncate">
                  {outfit.name}
                </span>

                {/* Checkmark */}
                <div
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
                              ${alreadyIn ? 'bg-black border-black' : 'bg-white border-black/20'}`}
                >
                  {alreadyIn && <Check className="w-3.5 h-3.5 text-primary" />}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Done button */}
      <div
        className="px-4 py-4 bg-white border-t-2 border-black flex-shrink-0"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={onClose}
          className="w-full btn-brutalist py-3 rounded-xl text-sm"
        >
          Done
        </button>
      </div>
    </motion.div>
  );
}
