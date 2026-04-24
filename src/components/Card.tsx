import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

interface CardBodyProps extends CardProps {
  margin?: boolean;
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

export function CardBody({
  children,
  margin = true,
  className = "",
}: CardBodyProps) {
  return <div className={`${margin && "m-4"} ${className}`}>{children}</div>;
}
