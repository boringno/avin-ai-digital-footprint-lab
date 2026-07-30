import { getRuntimeConfig } from "@/lib/live-demo-config";
import { getSupabaseServerClient } from "@/lib/supabase-server";

async function findAuthUserByEmail(email: string) {
  const supabase = getSupabaseServerClient();
  let page = 1;

  while (page < 50) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) {
      throw new Error(`Failed to list Supabase auth users: ${error.message}`);
    }

    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      return found;
    }

    if (data.users.length < 100) {
      return null;
    }
    page += 1;
  }

  return null;
}

async function main() {
  const config = getRuntimeConfig();
  const ownerEmail = config.bootstrapOwnerEmail.trim();
  if (!ownerEmail) {
    throw new Error("BOOTSTRAP_OWNER_EMAIL is required");
  }

  const authUser = await findAuthUserByEmail(ownerEmail);
  if (!authUser) {
    throw new Error(`No Supabase Auth user found for BOOTSTRAP_OWNER_EMAIL=${ownerEmail}. Create the user first, then rerun bootstrap.`);
  }

  const supabase = getSupabaseServerClient();
  const displayName = authUser.user_metadata?.name ?? ownerEmail.split("@")[0] ?? "Owner";
  const { error } = await supabase.from("staff_users").upsert(
    {
      auth_user_id: authUser.id,
      display_name: displayName,
      is_active: true,
      role: "owner",
      tenant_id: "tenant_001",
    },
    {
      onConflict: "auth_user_id",
    },
  );

  if (error) {
    throw new Error(`Failed to bootstrap owner staff user: ${error.message}`);
  }

  console.log(`Bootstrapped owner staff user for ${ownerEmail}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
