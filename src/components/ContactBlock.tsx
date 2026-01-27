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
  bgClassName?: string;
  buttonClassName?: string;
}

export default function ContactBlock({
  headline,
  body,
  buttonCopy,
  buttonHref,
  buttonIcon,
  bgClassName,
  buttonClassName,
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

  const containerClasses = `py-10 not-last:border-b ${bgClassName || "border-b-gray-200"}`;
  const buttonClasses = `mx-auto mt-5 flex max-w-100 items-center justify-center rounded-lg p-3 font-bold ${buttonClassName || "text-background-white bg-link"}`;

  return (
    <div className={containerClasses}>
      <Column narrow className="text-center">
        <h2 className="mb-2 text-2xl font-bold">{headline}</h2>
        <p dangerouslySetInnerHTML={{ __html: body }}></p>
        <a href={buttonHref} className={buttonClasses}>
          {buttonCopy}
          {renderIcon()}
        </a>
      </Column>
    </div>
  );
}
