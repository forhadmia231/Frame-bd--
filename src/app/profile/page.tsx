import { ProfilePage } from "@/components/account/library";
import { requirePageUser } from "@/modules/auth/authorization";
export default async function Page() {
  const user = await requirePageUser();
  return <ProfilePage user={user} />;
}
