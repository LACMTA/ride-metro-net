interface Props {
  className?: string;
}

export default function ArrowIcon({ className = "text-metro-text" }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 23 13"
      className={className}
    >
      <path
        fill="currentColor"
        d="m22.1211 2.12109-10 10.00001c-.5858.5858-1.5353.5858-2.1211 0L0 2.12109 2.12109 0l8.93941 8.93945L20 0l2.1211 2.12109Z"
      />
    </svg>
  );
}
