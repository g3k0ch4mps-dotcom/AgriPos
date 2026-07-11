import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Edit2, KeyRound, Trash2, X, MoreVertical } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { OwnerLayout } from "@/components/owner/OwnerLayout";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { createSellerFn, updateSellerFn, deleteSellerFn, resetSellerPasswordFn } from "@/lib/api/admin-users";
import { HoverTip } from "@/components/ui/tooltip";

export const Route = createFileRoute("/owner/staff")({
  component: StaffPage,
});

function StaffPage() {
  const qc = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const { data: sellers = [], isLoading } = useQuery({
    queryKey: ["sellers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "seller")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await deleteSellerFn({ data: { userId: id } });
    },
    onSuccess: () => {
      toast.success("Seller removed");
      qc.invalidateQueries({ queryKey: ["sellers"] });
    },
    onError: (err: any) => toast.error(err?.message || "Something went wrong"),
  });

  return (
    <OwnerLayout title="Staff Management">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Sellers</h2>
          <p className="text-sm text-muted-foreground">Manage your shop staff</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-[#3a4f22]"
        >
          <UserPlus className="h-4 w-4" />
          Add Seller
        </button>
      </div>

      {isAdding && (
        <div className="mb-8 rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Add New Seller</h3>
            <button onClick={() => setIsAdding(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
          </div>
          <SellerForm onSave={() => setIsAdding(false)} />
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading sellers...</div>
      ) : sellers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
          No sellers added yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sellers.map((seller) => (
            <div key={seller.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                    {seller.full_name?.substring(0, 2).toUpperCase() || "??"}
                  </div>
                  <div>
                    <h4 className="font-semibold">{seller.full_name}</h4>
                    <p className="text-xs text-muted-foreground">Added {format(new Date(seller.created_at), "MMM d, yyyy")}</p>
                    {seller.phone && <p className="text-xs text-muted-foreground mt-0.5">{seller.phone}</p>}
                  </div>
                </div>
              </div>

              {editingId === seller.id ? (
                <div className="mt-4 border-t border-border pt-4">
                  <SellerEditForm seller={seller} onCancel={() => setEditingId(null)} onSave={() => setEditingId(null)} />
                </div>
              ) : resettingId === seller.id ? (
                <div className="mt-4 border-t border-border pt-4">
                  <PasswordResetForm userId={seller.id} onCancel={() => setResettingId(null)} onSave={() => setResettingId(null)} />
                </div>
              ) : (
                <div className="mt-4 flex gap-2 border-t border-border pt-4">
                  <button
                    onClick={() => setEditingId(seller.id)}
                    className="flex-1 inline-flex justify-center items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium hover:bg-accent/80"
                  >
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => setResettingId(seller.id)}
                    className="flex-1 inline-flex justify-center items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium hover:bg-accent/80"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Reset
                  </button>
                  <HoverTip label="Remove seller">
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${seller.full_name}?`)) deleteMut.mutate(seller.id);
                      }}
                      className="inline-flex justify-center items-center rounded-md bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </HoverTip>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </OwnerLayout>
  );
}

function SellerForm({ onSave }: { onSave: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  
  const createMut = useMutation({
    mutationFn: async () => {
      await createSellerFn({ data: { name, password, phone } });
    },
    onSuccess: () => {
      toast.success("Seller added successfully");
      qc.invalidateQueries({ queryKey: ["sellers"] });
      onSave();
    },
    onError: (err: any) => toast.error(err?.message || "Something went wrong"),
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Full Name</label>
        <input 
          autoFocus
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="e.g. James Otieno"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Phone Number (Optional)</label>
        <input 
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
          value={phone} 
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. +254 700 000000"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Initial Password</label>
        <input 
          type="text"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          placeholder="Min 6 characters"
        />
      </div>
      <button 
        onClick={() => createMut.mutate()} 
        disabled={!name || password.length < 6 || createMut.isPending}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-[#3a4f22] disabled:opacity-50"
      >
        {createMut.isPending ? "Adding..." : "Add Seller"}
      </button>
    </div>
  );
}

function SellerEditForm({ seller, onCancel, onSave }: { seller: Profile; onCancel: () => void; onSave: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(seller.full_name || "");
  const [phone, setPhone] = useState(seller.phone || "");
  
  const updateMut = useMutation({
    mutationFn: async () => {
      await updateSellerFn({ data: { userId: seller.id, name, phone } });
    },
    onSuccess: () => {
      toast.success("Seller updated");
      qc.invalidateQueries({ queryKey: ["sellers"] });
      onSave();
    },
    onError: (err: any) => toast.error(err?.message || "Something went wrong"),
  });

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">Name</label>
        <input className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">Phone</label>
        <input className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">Cancel</button>
        <button 
          onClick={() => updateMut.mutate()} 
          disabled={!name || updateMut.isPending}
          className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-[#3a4f22] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function PasswordResetForm({ userId, onCancel, onSave }: { userId: string; onCancel: () => void; onSave: () => void }) {
  const [password, setPassword] = useState("");
  
  const resetMut = useMutation({
    mutationFn: async () => {
      await resetSellerPasswordFn({ data: { userId, password } });
    },
    onSuccess: () => {
      toast.success("Password reset successfully");
      onSave();
    },
    onError: (err: any) => toast.error(err?.message || "Something went wrong"),
  });

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">New Password</label>
        <input 
          type="text" 
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          placeholder="Min 6 chars"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">Cancel</button>
        <button 
          onClick={() => resetMut.mutate()} 
          disabled={password.length < 6 || resetMut.isPending}
          className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-[#3a4f22] disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
