import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export default function Column({ children }: Props) {
  return <div className="m-auto w-11/12 max-w-3xl">{children}</div>;
}
