import type { ReactNode } from "react";

interface BaseProps {
  children: ReactNode;
  selected?: boolean;
  className?: string;
}

interface ButtonProps extends BaseProps {
  as?: "button";
  onClick?: () => void;
  href?: never;
}

interface AnchorProps extends BaseProps {
  as: "a";
  href: string;
  onClick?: () => void;
  target?: string;
  rel?: string;
}

type Props = ButtonProps | AnchorProps;

export default function Button(props: Props) {
  const { children, selected = false, className = "", onClick } = props;
  const sharedClassName = `bg-blue cursor-pointer rounded-sm px-5 py-2 text-white ${className}`;

  if (props.as === "a") {
    return (
      <a
        href={props.href}
        onClick={onClick}
        className={sharedClassName}
        target={props.target}
        rel={props.rel}
      >
        {children}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={sharedClassName}>
      {children}
    </button>
  );
}
