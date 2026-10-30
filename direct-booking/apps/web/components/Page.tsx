import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function Page({ children, current }: { children: ReactNode; current?: string }) {
  return (
    <>
      <SiteHeader current={current} />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
