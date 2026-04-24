import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`bg-background-white mb-5 overflow-hidden rounded-xl ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: CardProps) {
  return (
    <h2
      className={`text-background-white bg-black p-4 text-5xl font-bold ${className}`}
    >
      {children}
    </h2>
  );
}

export function CardBody({ children, className = "" }: CardProps) {
  return <div className={`m-4 ${className}`}>{children}</div>;
}
