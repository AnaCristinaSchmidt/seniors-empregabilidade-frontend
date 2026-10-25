import type { ReactNode } from "react";

export function SectionHeading({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <h3 id={id} className="text-xl font-bold text-foreground">
      {children}
    </h3>
  );
}
