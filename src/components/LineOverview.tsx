import MapPinIcon from "./MapPinIcon";
import ClockIcon from "./ClockIcon";
import DownloadIcon from "./DownloadIcon";
import Button from "./Button";
import { formatGTFSTime } from "../lib/formatGTFSTime";
import type { RouteOverview } from "../lib/getRouteOverview";

interface Props {
  lineTitle: string;
  routeOverview: RouteOverview;
  pdfUrl: string;
  routeType: number;
}

export default function LineOverview({
  lineTitle,
  routeOverview,
  pdfUrl,
  routeType,
}: Props) {
  const pluralVehicleName = routeType === 3 ? "Buses" : "Trains";
  return (
    <div className="pt-5 pb-50">
      <h2 className="mb-6 text-2xl font-bold">{lineTitle} Overview</h2>
      <div className="flex">
        <MapPinIcon
          aria-hidden="true"
          className="mr-3 inline h-6 w-6 shrink-0"
        />
        <p>
          {pluralVehicleName} run between{" "}
          <a
            href={`/stops/${routeOverview.firstStopId}`}
            className="text-blue underline"
          >
            {routeOverview.firstStopName}
          </a>
          {" and "}
          <a
            href={`/stops/${routeOverview.lastStopId}`}
            className="text-blue underline"
          >
            {routeOverview.lastStopName}
          </a>{" "}
          with {routeOverview.stopCount} stops between.
        </p>
      </div>
      {routeOverview.weekday.first &&
        routeOverview.weekday.last &&
        routeOverview.weekend.first &&
        routeOverview.weekend.last && (
          <div className="mt-6 mb-10 flex">
            <ClockIcon
              aria-hidden="true"
              className="mr-3 inline h-6 w-6 shrink-0"
            />
            <div>
              <p>
                <b>Monday through Friday</b>
                <br />
                {pluralVehicleName} run between{" "}
                {formatGTFSTime(routeOverview.weekday.first)} and{" "}
                {formatGTFSTime(routeOverview.weekday.last)}
              </p>
              <p className="mt-1">
                <b>Saturdays, Sundays, and Holidays</b>
                <br />
                {pluralVehicleName} run between{" "}
                {formatGTFSTime(routeOverview.weekend.first)} and{" "}
                {formatGTFSTime(routeOverview.weekend.last)}
              </p>
            </div>
          </div>
        )}

      <h2 className="mb-4 text-2xl font-bold">{lineTitle} Details</h2>
      <p className="mb-4">
        Find stop times, maps, and more in the document below.
      </p>
      <Button as="a" href={pdfUrl} target="_blank" rel="noopener noreferrer">
        View Schedule and Map{" "}
        <DownloadIcon className="inline text-white" aria-hidden="true" />
      </Button>
    </div>
  );
}
