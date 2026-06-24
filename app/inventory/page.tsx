import { redirect } from "next/navigation";

export default function InventoryRoutePage() {
  redirect("/?tab=inventory");
}
