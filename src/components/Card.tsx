import type { ReactNode } from "react";
import ChevronIcon from "./ChevronIcon";

interface CardProps {
  children: ReactNode;
  className?: string;
}

interface CardBodyProps extends CardProps {
  margin?: boolean;
}

interface CardLinkListItemProps extends CardProps {
  link?: string;
}

const BODY_MARGIN = "m-4";

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
      className={`text-background-white bg-black p-4 text-3xl font-bold ${className}`}
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
  return (
    <div className={`${margin && BODY_MARGIN} ${className}`}>{children}</div>
  );
}

export function CardLinkListItem({
  children,
  className = "",
}: CardLinkListItemProps) {
  return (
    <a className={`${BODY_MARGIN} flex items-center justify-between`}>
      {children}
      <ChevronIcon className="h-2 rotate-270" />
    </a>
  );
}
