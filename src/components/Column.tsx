import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  narrow?: boolean;
  className?: string;
}

export default function Column({ children, narrow, className = "" }: Props) {
  return (
    <div
      className={`m-auto w-11/12 ${narrow ? "max-w-150" : "max-w-3xl"} ${className}`}
    >
      {children}
    </div>
  );
}
