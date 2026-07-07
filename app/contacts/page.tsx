import { vaultConfigured } from "@/lib/vault";
import { getContactsHealth } from "@/lib/contactsHealth";
import { listNeedsReviewPeople } from "@/lib/peopleDb";
import { cutoverActive } from "@/lib/dbSource";
import { getDb, accounts as accountsT } from "@/lib/db";
import ContactsHealthView from "@/components/ContactsHealth";
import PeopleReviewQueue from "@/components/PeopleReviewQueue";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ContactsPage() {
  if (!vaultConfigured()) {
    return <SetupNotice missing={["GITHUB_TOKEN", "VAULT_REPO"]} />;
  }

  const data = await getContactsHealth();

  // Who-is-who confirm queue (DB only; empty pre-cutover).
  const reviewPeople = await listNeedsReviewPeople().catch(() => []);
  let reviewAccounts: Array<{ id: number; name: string }> = [];
  if (reviewPeople.length && (await cutoverActive())) {
    try {
      reviewAccounts = await getDb()
        .select({ id: accountsT.id, name: accountsT.name })
        .from(accountsT)
        .orderBy(accountsT.name);
    } catch {
      reviewAccounts = [];
    }
  }

  return (
    <div>
      <header className="mb-5">
        <h1 className="display-title text-[30px] leading-tight text-fg">Contacts</h1>
        <p className="mt-1 text-sm text-muted">
          Relationship health across your accounts. Who is waiting on a reply and who has gone quiet.
        </p>
      </header>
      <PeopleReviewQueue
        people={reviewPeople.map((p) => ({
          id: p.id,
          fullName: p.fullName,
          classification: p.classification,
          accountName: p.accountName,
          email: p.email,
          title: p.title,
        }))}
        accounts={reviewAccounts}
      />
      <ContactsHealthView data={data} />
    </div>
  );
}
