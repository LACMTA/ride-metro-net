import type { ConciseAlert } from "../pages/api/alerts";

interface Props {
  alert: ConciseAlert;
}

export default function Alert({ alert }: Props) {
  return (
    <div>
      <h4>{alert.effect}</h4>
      <p>{alert.descriptionText}</p>
    </div>
  );
}
