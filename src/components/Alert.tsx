import type { ConciseAlert } from "../pages/api/alerts";
import AlertIconColumn from "./AlertIconColumn";

interface Props {
  alert: ConciseAlert;
}

export default function Alert({ alert }: Props) {
  return (
    <div className="flex px-4 py-5 not-last:border-b not-last:border-b-gray-800">
      <AlertIconColumn />
      <div>
        <h4 className="font-bold capitalize">
          {String(alert.cause).toLowerCase().replace("_", " ")}
        </h4>
        <p>{alert.descriptionText}</p>
      </div>
    </div>
  );
}
