import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  narrow?: boolean;
  wide?: boolean;
  className?: string;
}

export default function Column({
  children,
  narrow,
  wide,
  className = "",
}: Props) {
  return (
    <div
      className={`m-auto w-11/12 ${wide ? "max-w-7xl" : narrow ? "max-w-150" : "max-w-3xl"} ${className}`}
    >
      {children}
    </div>
  );
}
