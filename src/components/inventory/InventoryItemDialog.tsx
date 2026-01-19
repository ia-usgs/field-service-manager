import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useStore } from "@/store/useStore";
import { InventoryItem } from "@/types";
import { dollarsToCents } from "@/lib/db";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const inventoryItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  sku: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  unitCost: z.coerce.number().min(0, "Cost must be positive"),
  unitPrice: z.coerce.number().min(0, "Price must be positive"),
  quantity: z.coerce.number().min(0, "Quantity must be positive"),
  reorderLevel: z.coerce.number().min(0).optional(),
  category: z.string().max(50).optional(),
});

type InventoryItemFormData = z.infer<typeof inventoryItemSchema>;

interface InventoryItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: InventoryItem;
}

export function InventoryItemDialog({ open, onOpenChange, item }: InventoryItemDialogProps) {
  const { addInventoryItem, updateInventoryItem } = useStore();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InventoryItemFormData>({
    resolver: zodResolver(inventoryItemSchema),
    defaultValues: {
      name: "",
      sku: "",
      description: "",
      unitCost: 0,
      unitPrice: 0,
      quantity: 0,
      reorderLevel: 0,
      category: "",
    },
  });

  useEffect(() => {
    if (item) {
      reset({
        name: item.name,
        sku: item.sku || "",
        description: item.description || "",
        unitCost: item.unitCostCents / 100,
        unitPrice: item.unitPriceCents / 100,
        quantity: item.quantity,
        reorderLevel: item.reorderLevel || 0,
        category: item.category || "",
      });
    } else {
      reset({
        name: "",
        sku: "",
        description: "",
        unitCost: 0,
        unitPrice: 0,
        quantity: 0,
        reorderLevel: 0,
        category: "",
      });
    }
  }, [item, reset, open]);

  const watchedValues = watch();
  const profitMargin = watchedValues.unitPrice > 0 
    ? ((watchedValues.unitPrice - watchedValues.unitCost) / watchedValues.unitPrice * 100).toFixed(1)
    : "0";

  const onSubmit = async (data: InventoryItemFormData) => {
    const itemData = {
      name: data.name,
      sku: data.sku || undefined,
      description: data.description || undefined,
      unitCostCents: dollarsToCents(data.unitCost),
      unitPriceCents: dollarsToCents(data.unitPrice),
      quantity: data.quantity,
      reorderLevel: data.reorderLevel || undefined,
      category: data.category || undefined,
    };

    if (item) {
      await updateInventoryItem(item.id, itemData);
    } else {
      await addInventoryItem(itemData);
    }

    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Inventory Item" : "Add Inventory Item"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Item Name *</label>
            <input
              {...register("name")}
              className="input-field w-full"
              placeholder="e.g., Circuit Breaker 20A"
            />
            {errors.name && (
              <p className="text-destructive text-xs mt-1">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">SKU</label>
              <input
                {...register("sku")}
                className="input-field w-full"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <input
                {...register("category")}
                className="input-field w-full"
                placeholder="e.g., Electrical"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              {...register("description")}
              className="input-field w-full min-h-[60px] resize-none"
              placeholder="Optional description"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Your Cost ($)</label>
              <input
                {...register("unitCost")}
                type="number"
                step="0.01"
                className="input-field w-full"
              />
              {errors.unitCost && (
                <p className="text-destructive text-xs mt-1">{errors.unitCost.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sell Price ($)</label>
              <input
                {...register("unitPrice")}
                type="number"
                step="0.01"
                className="input-field w-full"
              />
              {errors.unitPrice && (
                <p className="text-destructive text-xs mt-1">{errors.unitPrice.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Margin</label>
              <div className={`input-field w-full bg-secondary/50 ${parseFloat(profitMargin) > 0 ? "text-success" : "text-muted-foreground"}`}>
                {profitMargin}%
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Stock Quantity</label>
              <input
                {...register("quantity")}
                type="number"
                className="input-field w-full"
              />
              {watchedValues.quantity === 0 && (
                <p className="text-warning text-xs mt-1">
                  Items with 0 stock won't be selectable in jobs
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reorder Level</label>
              <input
                {...register("reorderLevel")}
                type="number"
                className="input-field w-full"
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
            >
              {isSubmitting ? "Saving..." : item ? "Update Item" : "Add Item"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}