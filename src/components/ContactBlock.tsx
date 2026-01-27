import type { ReactElement } from "react";
import Column from "./Column";

interface Props {
  headline: string;
  body: string;
  buttonCopy: string;
  buttonHref: string;
  buttonIcon?: ReactElement;
}

export default function ContactBlock({
  headline,
  body,
  buttonCopy,
  buttonHref,
  buttonIcon,
}: Props) {
  return (
    <Column classNames="text-center my-7">
      <h2 className="mb-2 text-2xl font-bold">{headline}</h2>
      <p dangerouslySetInnerHTML={{ __html: body }}></p>
      <a
        href={buttonHref}
        className="text-background-white bg-link mx-auto block max-w-100 rounded-lg p-3 font-bold"
      >
        {buttonCopy}
      </a>
    </Column>
  );
}
