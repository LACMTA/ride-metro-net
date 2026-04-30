import type { ReactNode } from "react";
import ChevronIcon from "./ChevronIcon";
import { DisclosureButton, DisclosurePanel } from "@headlessui/react";

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

interface CardDiscolsureButtonProps extends CardProps {
  open: boolean;
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
      className={` ${BODY_PADDING} border-divider-line flex items-center justify-between py-6 font-bold not-last:border-b`}
    >
      {children}
      <ChevronIcon className="h-2 rotate-270" />
    </a>
  );
}

export function CardDiscolsureButton({
  children,
  className = "",
  open,
}: CardDiscolsureButtonProps) {
  return (
    <DisclosureButton
      className={` ${BODY_PADDING} border-divider-line flex w-full cursor-pointer items-center justify-between py-6 font-bold ${!open && "not-last:border-b"}`}
    >
      <span>{children}</span>
      <ChevronIcon className={`h-2 ${open ? "rotate-180" : ""}`} />
    </DisclosureButton>
  );
}

export function CardDisclosurePanel({ children, className = "" }: CardProps) {
  return (
    <DisclosurePanel
      className={`${BODY_PADDING} border-divider-line pt-0 not-last:border-b ${className}`}
    >
      {children}
    </DisclosurePanel>
  );
}
