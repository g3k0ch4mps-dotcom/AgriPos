import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase admin credentials");
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const generateHiddenEmail = (name: string) => {
  return `${name.toLowerCase().trim().replace(/[^a-z0-9]/g, '.')}@agripos.internal`;
};

export const createSellerFn = createServerFn({ method: "POST" })
  .validator((data: { name: string; password: string; phone?: string }) => data)
  .handler(async ({ data }) => {
  const adminClient = getAdminClient();
  const email = generateHiddenEmail(data.name);

  // 1. Create Auth User
  const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
    email,
    password: data.password,
    email_confirm: true, // Auto-confirm
    user_metadata: {
      full_name: data.name,
      phone: data.phone || null,
    },
  });

  if (userError) {
    throw new Error(userError.message);
  }

  // 2. We don't need to manually insert into `profiles` because of the `handle_new_user` DB trigger,
  // but we can update the profile with the phone number since the trigger might not capture it.
  const userId = userData.user.id;
  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ phone: data.phone || null })
    .eq("id", userId);

  if (profileError) {
    console.error("Failed to update profile phone:", profileError);
  }

  return { success: true, userId };
});

export const updateSellerFn = createServerFn({ method: "POST" })
  .validator((data: { userId: string; name: string; phone?: string; email?: string }) => data)
  .handler(async ({ data }) => {
  const adminClient = getAdminClient();
  
  // Optional: Update Auth User (email and metadata)
  const updates: any = {
    user_metadata: {
      full_name: data.name,
      phone: data.phone || null,
    },
  };
  
  if (data.email) {
    updates.email = data.email;
  }
  
  const { error: userError } = await adminClient.auth.admin.updateUserById(data.userId, updates);

  if (userError) {
    throw new Error(userError.message);
  }

  // Update Profile
  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ full_name: data.name, phone: data.phone || null })
    .eq("id", data.userId);

  if (profileError) {
    throw new Error(profileError.message);
  }

  return { success: true };
});

export const resetSellerPasswordFn = createServerFn({ method: "POST" })
  .validator((data: { userId: string; password: string }) => data)
  .handler(async ({ data }) => {
  const adminClient = getAdminClient();
  
  const { error: userError } = await adminClient.auth.admin.updateUserById(data.userId, {
    password: data.password,
  });

  if (userError) {
    throw new Error(userError.message);
  }

  return { success: true };
});

export const deleteSellerFn = createServerFn({ method: "POST" })
  .validator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
  const adminClient = getAdminClient();
  
  // This will cascade and delete the profile too due to `on delete cascade` in DB
  const { error } = await adminClient.auth.admin.deleteUser(data.userId);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
});
