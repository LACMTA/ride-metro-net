import type { ConciseAlert } from "../pages/api/alerts";
import AlertIconColumn from "./AlertIconColumn";

interface Props {
  alert: ConciseAlert;
  fullWidth?: boolean;
  showAlertIcon?: boolean;
}

export default function Alert({
  alert,
  fullWidth = false,
  showAlertIcon = true,
}: Props) {
  return (
    <div
      className={`flex ${fullWidth ? "" : "px-4"} not-last:border-b-divider-line py-5 not-last:border-b`}
    >
      {showAlertIcon && <AlertIconColumn />}
      <div>
        <h4 className="font-bold capitalize">
          {String(alert.effect).toLowerCase().replace("_", " ")}
        </h4>
        <p>{alert.descriptionText}</p>
      </div>
    </div>
  );
}
