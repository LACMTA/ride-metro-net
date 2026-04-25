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
  href: string;
}

const BODY_PADDING = "p-4";

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
    <div className={`${margin && BODY_PADDING} ${className}`}>{children}</div>
  );
}

export function CardLinkListItem({
  children,
  className = "",
  href,
}: CardLinkListItemProps) {
  return (
    <a
      href={href}
      className={` ${BODY_PADDING} border-divider-line flex items-center justify-between py-6 not-last:border-b`}
    >
      {children}
      <ChevronIcon className="h-2 rotate-270" />
    </a>
  );
}
