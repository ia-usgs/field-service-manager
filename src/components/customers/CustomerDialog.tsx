import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Trash2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { Customer } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const customerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  tags: z.string().optional(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

interface CustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer;
}

export function CustomerDialog({
  open,
  onOpenChange,
  customer,
}: CustomerDialogProps) {
  const { addCustomer, updateCustomer, deleteCustomer, jobs } = useStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address: "",
      notes: "",
      tags: "",
    },
  });

  useEffect(() => {
    if (customer) {
      reset({
        name: customer.name,
        email: customer.email || "",
        phone: customer.phone || "",
        address: customer.address || "",
        notes: customer.notes || "",
        tags: customer.tags.join(", "),
      });
    } else {
      reset({
        name: "",
        email: "",
        phone: "",
        address: "",
        notes: "",
        tags: "",
      });
    }
  }, [customer, reset, open]);

  const onSubmit = async (data: CustomerFormData) => {
    setIsSubmitting(true);
    try {
      const tags = data.tags
        ? data.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [];

      if (customer) {
        await updateCustomer(customer.id, {
          name: data.name,
          email: data.email || "",
          phone: data.phone || "",
          address: data.address || "",
          notes: data.notes || "",
          tags,
        });
      } else {
        await addCustomer({
          name: data.name,
          email: data.email || "",
          phone: data.phone || "",
          address: data.address || "",
          notes: data.notes || "",
          tags,
        });
      }
      onOpenChange(false);
      reset();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (customer) {
      await deleteCustomer(customer.id);
      setIsDeleteDialogOpen(false);
      onOpenChange(false);
    }
  };

  // Check if customer has any jobs (can't delete if they do)
  const customerHasJobs = customer ? jobs.some((j) => j.customerId === customer.id) : false;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>
              {customer ? "Edit Customer" : "Add New Customer"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                {...register("name")}
                className="input-field w-full"
                placeholder="Customer name"
              />
              {errors.name && (
                <p className="text-destructive text-xs mt-1">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                {...register("email")}
                type="email"
                className="input-field w-full"
                placeholder="email@example.com"
              />
              {errors.email && (
                <p className="text-destructive text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input
                {...register("phone")}
                className="input-field w-full"
                placeholder="(555) 555-5555"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Address</label>
              <input
                {...register("address")}
                className="input-field w-full"
                placeholder="Service address"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                {...register("notes")}
                className="input-field w-full min-h-[80px] resize-none"
                placeholder="Internal notes about this customer..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Tags (comma separated)
              </label>
              <input
                {...register("tags")}
                className="input-field w-full"
                placeholder="residential, repeat, commercial"
              />
            </div>

            <div className="flex gap-3 pt-4">
              {customer && (
                <button
                  type="button"
                  onClick={() => setIsDeleteDialogOpen(true)}
                  disabled={customerHasJobs}
                  className="btn-secondary flex items-center gap-2 text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={customerHasJobs ? "Cannot delete customer with jobs" : "Delete customer"}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary flex-1"
              >
                {isSubmitting ? "Saving..." : customer ? "Update" : "Add Customer"}
              </button>
            </div>

            {customer && customerHasJobs && (
              <p className="text-xs text-muted-foreground text-center">
                Note: Customers with jobs cannot be deleted. Use archive instead from the customer profile.
              </p>
            )}
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{customer?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
