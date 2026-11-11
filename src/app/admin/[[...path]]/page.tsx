import { notFound } from "next/navigation";
import { adminPage } from "@/modules/admin/access";
import { AdminConsole } from "@/components/admin/admin-console";
import { navigation, fields } from "@/modules/admin/ui-config";
import "./admin.css";
export const metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const user = await adminPage();
  const { path = [] } = await params;
  const [resource = "", recordId] = path;
  if (
    path.length > 2 ||
    !["", ...navigation.map((n) => n[0]), ...Object.keys(fields)].includes(
      resource,
    )
  )
    notFound();
  if (["settings", "payment-methods"].includes(resource) && user.role !== "SUPER_ADMIN")
    return (
      <div className="container page-content">
        <h1>Super Admin authorization required</h1>
      </div>
    );
  return (
    <AdminConsole
      key={`${resource}/${recordId || ""}`}
      user={user}
      resource={resource}
      recordId={recordId}
    />
  );
}
