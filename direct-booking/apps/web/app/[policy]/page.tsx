import type { Metadata } from "next";
import { existsSync } from "node:fs";
import { notFound } from "next/navigation";
import { Page } from "../../components/Page";
import { contentFile, contentPath } from "../../lib/content-files";
import { renderMarkdown } from "../../lib/markdown";
import { site } from "../../lib/site";

// Policy pages from sites/<id>/content/<name>.md, figures filled from config.
const POLICIES = ["house-rules", "cancellation", "terms", "privacy"] as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return POLICIES.filter((p) => existsSync(contentPath(`${p}.md`))).map((policy) => ({ policy }));
}

type Params = { params: Promise<{ policy: string }> };

function load(policy: string) {
  if (!(POLICIES as readonly string[]).includes(policy)) notFound();
  const source = contentFile(`${policy}.md`);
  const title = /^# (.+)$/m.exec(source)?.[1] ?? policy;
  return { title, draft: /^<!-- draft/.test(source.trimStart()), html: renderMarkdown(source.replace(/^# .+$/m, "")) };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return { title: `${load((await params).policy).title} · ${site.name}` };
}

export default async function PolicyPage({ params }: Params) {
  const { title, draft, html } = load((await params).policy);
  return (
    <Page>
      <div className="wrap page-head">
        <h1 className="h2">{title}</h1>
        {draft && (
          <p className="notice" role="note">
            Draft: this page is still being reviewed and may change before bookings open.
          </p>
        )}
      </div>
      <div className="wrap prose" dangerouslySetInnerHTML={{ __html: html }} />
    </Page>
  );
}
