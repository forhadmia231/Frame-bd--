import { AccountForm } from "@/components/account/account-form";
export const metadata = { title: "Reset password", referrer: "no-referrer" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <AccountForm
      mode="reset-password"
      token={(await searchParams).token || ""}
    />
  );
}
