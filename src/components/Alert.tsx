import type { ConciseAlert } from "../pages/api/alerts";

interface Props {
  alert: ConciseAlert;
}

export default function Alert({ alert }: Props) {
  return (
    <div>
      <h4 className="font-bold capitalize">
        {String(alert.effect).toLowerCase()}
      </h4>
      <p>{alert.descriptionText}</p>
    </div>
  );
}
