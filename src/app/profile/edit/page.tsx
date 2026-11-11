import { AccountForm } from "@/components/account/account-form";
import { requirePageUser } from "@/modules/auth/authorization";
import { getDb } from "@/lib/db";
export const metadata = { title: "Edit profile" };
export default async function Page() {
  const user = await requirePageUser();
  const profile = await getDb().userProfile.findUnique({
    where: { userId: user.id },
  });
  return (
    <AccountForm
      mode="edit-profile"
      initialName={user.name}
      initialBio={profile?.bio || ""}
    />
  );
}
