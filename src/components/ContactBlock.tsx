import ArrowIcon from "./ArrowIcon";
import Column from "./Column";
import EmailIcon from "./EmailIcon";
import PhoneIcon from "./PhoneIcon";

interface Props {
  headline: string;
  body: string;
  buttonCopy: string;
  buttonHref: string;
  buttonIcon?: "phone" | "arrow" | "email";
}

export default function ContactBlock({
  headline,
  body,
  buttonCopy,
  buttonHref,
  buttonIcon,
}: Props) {
  const iconClasses = "fill-background-white h-4 ml-2 ";

  const renderIcon = () => {
    if (buttonIcon === "phone") {
      return <PhoneIcon className={iconClasses} />;
    } else if (buttonIcon === "arrow") {
      return <ArrowIcon className={`${iconClasses} rotate-315`} />;
    } else if (buttonIcon === "email") {
      return <EmailIcon className={iconClasses} />;
    }
    return null;
  };

  return (
    <div className="border-b-gray-200 not-last:border-b">
      <Column classNames="text-center my-10 max-w-150">
        <h2 className="mb-2 text-2xl font-bold">{headline}</h2>
        <p dangerouslySetInnerHTML={{ __html: body }}></p>
        <a
          href={buttonHref}
          className="text-background-white bg-link mx-auto mt-5 flex max-w-100 items-center justify-center rounded-lg p-3 font-bold"
        >
          {buttonCopy}
          {renderIcon()}
        </a>
      </Column>
    </div>
  );
}
