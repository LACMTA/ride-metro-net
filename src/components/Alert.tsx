import type { ConciseAlert } from "../pages/api/alerts";
import AlertIconColumn from "./AlertIconColumn";
import {
  formatTimestamp,
  formatTimeOnly,
  getDateInPT,
} from "../lib/formatTimestamp";
import CalendarIcon from "./CalendarIcon";

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
        <p className="mt-2 flex items-center text-gray-600">
          <CalendarIcon className="mr-1.5 inline h-4" />
          {/* The alert is active */}
          {Date.now() / 1000 >= alert.activePeriod.start ? (
            <>Ends {formatTimestamp(alert.activePeriod.end)}.</>
          ) : getDateInPT(alert.activePeriod.start) ===
            getDateInPT(alert.activePeriod.end) ? (
            <>
              {getDateInPT(alert.activePeriod.start)} from{" "}
              {formatTimeOnly(alert.activePeriod.start)} to{" "}
              {formatTimeOnly(alert.activePeriod.end)}.
            </>
          ) : (
            <>
              {formatTimestamp(alert.activePeriod.start)} to{" "}
              {formatTimestamp(alert.activePeriod.end)}.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
