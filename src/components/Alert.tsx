import type { ConciseAlert } from "../pages/api/alerts";
import AlertIconColumn from "./AlertIconColumn";

interface Props {
  alert: ConciseAlert;
  fullWidth?: boolean;
}

export default function Alert({ alert, fullWidth = false }: Props) {
  return (
    <div
      className={`flex ${fullWidth ? "" : "px-4"} py-5 not-last:border-b not-last:border-b-gray-800`}
    >
      <AlertIconColumn />
      <div>
        <h4 className="font-bold capitalize">
          {String(alert.effect).toLowerCase().replace("_", " ")}
        </h4>
        <p>{alert.descriptionText}</p>
      </div>
    </div>
  );
}
