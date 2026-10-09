import { connection } from "next/server";
import Admin from "@/components/admin";
export const metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};
export default async function AdminPage() {
  // The CSP nonce must be applied to scripts for each incoming request.
  await connection();
  return <Admin />;
}
