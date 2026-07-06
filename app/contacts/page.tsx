import { vaultConfigured } from "@/lib/vault";
import { getContactsHealth } from "@/lib/contactsHealth";
import ContactsHealthView from "@/components/ContactsHealth";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ContactsPage() {
  if (!vaultConfigured()) {
    return <SetupNotice missing={["GITHUB_TOKEN", "VAULT_REPO"]} />;
  }

  const data = await getContactsHealth();

  return (
    <div>
      <header className="mb-5">
        <h1 className="display-title text-[30px] leading-tight text-fg">Contacts</h1>
        <p className="mt-1 text-sm text-muted">
          Relationship health across your accounts. Who is waiting on a reply and who has gone quiet.
        </p>
      </header>
      <ContactsHealthView data={data} />
    </div>
  );
}
