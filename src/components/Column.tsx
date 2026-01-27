import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  classNames?: string;
}

export default function Column({ children, classNames = "" }: Props) {
  return (
    <div className={`m-auto w-11/12 max-w-3xl ${classNames}`}>{children}</div>
  );
}
